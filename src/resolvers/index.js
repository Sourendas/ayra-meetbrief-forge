import { makeResolver } from '@forge/resolver';
import { fetchIssueContext, postIssueComment, searchConfluencePages } from '../lib/atlassian.js';
import { assembleBriefFromInputs } from '../lib/brief.js';
import {
  changesSincePrevious,
  historyEntryFromBrief,
  markPosted,
  mergeHistory,
  openQuestionsCommentAdf,
} from '../lib/history.js';
import { loadHistory, saveHistory } from '../lib/store.js';
import { normalizeIssueKey, normalizeSpaceKey } from '../lib/text.js';

// Named makeResolver, not `new Resolver()`. With "type": "module", Forge's
// bundler binds that default import to a namespace object and invoke fails
// with "out_namespaceObject is not a constructor". package.json stays CommonJS.

function consentError(error) {
  return /401|unauthorized|not authorized|consent|authorization header/i.test(String(error?.message || error || ''));
}

/**
 * Issue panel and Confluence page: read the work item and related pages, then assemble the brief.
 * A missing read becomes a warning on the brief, not a fabricated status or URL.
 */
export const handler = makeResolver({
  generateBrief: async ({ payload, context }) => {
    const body = payload || {};
    const warnings = [];
    const requestedKey = String(body.issueKey || '').trim();
    const contextKey = context?.extension?.issue?.key || '';
    const issueKey = normalizeIssueKey(requestedKey) || normalizeIssueKey(contextKey);

    if (requestedKey && !normalizeIssueKey(requestedKey)) {
      warnings.push('That issue key does not look like PROJ-123, so Jira was not queried.');
    }

    let issueContext = null;
    if (issueKey) {
      try {
        const fetched = await fetchIssueContext(issueKey, { auth: 'user' });
        if (fetched.ok) issueContext = fetched.issue;
        else warnings.push(fetched.message);
      } catch (error) {
        if (consentError(error)) throw error;
        warnings.push('Jira could not be read. The brief stays a template until the read succeeds.');
      }
    }

    const typedSubject = String(body.subject || '').trim();
    const subject =
      typedSubject && (!issueKey || typedSubject.toUpperCase() !== issueKey)
        ? typedSubject
        : issueContext?.summary || typedSubject || issueKey;

    if (!subject) {
      return {
        status: 'error',
        error: 'Add a subject or an issue key. On a Jira work item, MeetBrief can use the issue that is open.',
      };
    }

    const typedQuery = String(body.confluenceQuery || '').trim();
    const query = typedQuery || issueContext?.summary || typedSubject || issueKey;
    const spaceKey = normalizeSpaceKey(body.spaceKey);
    if (String(body.spaceKey || '').trim() && !spaceKey) {
      warnings.push('Space key was ignored. Use letters, numbers, or underscores.');
    }

    let pageContext = null;
    if (query) {
      try {
        const searched = await searchConfluencePages(query, spaceKey, { auth: 'user' });
        if (searched.ok) {
          pageContext = {
            query: searched.query,
            spaceKey: searched.spaceKey,
            pages: searched.pages,
          };
        } else {
          warnings.push(searched.message);
          pageContext = { query, spaceKey: spaceKey || null, pages: [], error: searched.message };
        }
      } catch (error) {
        if (consentError(error)) throw error;
        const message = 'Confluence search failed. The brief continues without pages.';
        warnings.push(message);
        pageContext = { query, spaceKey: spaceKey || null, pages: [], error: message };
      }
    }

    const brief = assembleBriefFromInputs({
      subject,
      kind: body.kind === 'person' ? 'person' : 'company',
      role: body.role || 'teammate',
      meetingLabel: String(body.meetingLabel || '').trim(),
      objective: String(body.objective || '').trim(),
      issueContext,
      pageContext,
      warnings,
    });

    // Persist a compact entry per work item so the panel can show what changed since last time.
    let history = [];
    let historyEntryId = '';
    let historyWarning = '';
    if (issueContext?.key) {
      try {
        const merged = mergeHistory(await loadHistory(issueContext.key), historyEntryFromBrief(brief));
        await saveHistory(issueContext.key, merged.history);
        history = merged.history;
        historyEntryId = merged.entry.id;
      } catch (error) {
        console.error('brief history unavailable', error?.message || error);
        historyWarning = 'Brief history could not be saved this time. The brief itself is unaffected.';
      }
    }

    return {
      status: 'success',
      brief,
      history,
      historyEntryId,
      historyWarning,
      changes: changesSincePrevious(history),
      context: {
        issueKey: issueKey || null,
        surface: issueKey && !requestedKey ? 'jira' : context?.extension?.type || null,
      },
    };
  },

  getHistory: async ({ payload, context }) => {
    const issueKey = normalizeIssueKey(payload?.issueKey) || normalizeIssueKey(context?.extension?.issue?.key);
    if (!issueKey) return { status: 'error', error: 'No work item to read history for.', history: [] };
    try {
      const history = await loadHistory(issueKey);
      return { status: 'success', history, changes: changesSincePrevious(history) };
    } catch (error) {
      console.error('getHistory failed', error?.message || error);
      return { status: 'error', error: 'Brief history could not be read.', history: [] };
    }
  },

  // Write-back: post the stored brief's open questions as a Jira comment, once per brief.
  postOpenQuestions: async ({ payload, context }) => {
    const issueKey = normalizeIssueKey(payload?.issueKey) || normalizeIssueKey(context?.extension?.issue?.key);
    const entryId = String(payload?.historyEntryId || '');
    if (!issueKey || !entryId) {
      return { status: 'error', error: 'Build a brief on a Jira work item first, then post its open questions.' };
    }
    let history;
    try {
      history = await loadHistory(issueKey);
    } catch (error) {
      console.error('postOpenQuestions history read failed', error?.message || error);
      return { status: 'error', error: 'Brief history could not be read, so nothing was posted.' };
    }
    const entry = history.find((item) => item.id === entryId);
    if (!entry) return { status: 'error', error: 'That brief is no longer in history. Rebuild it, then post.' };
    if (entry.commentUrl) {
      return { status: 'already-posted', commentUrl: entry.commentUrl, history, changes: changesSincePrevious(history) };
    }
    const adf = openQuestionsCommentAdf(entry, issueKey);
    if (!adf) return { status: 'error', error: 'This brief has no open questions to post.' };

    let posted;
    try {
      posted = await postIssueComment(issueKey, adf);
    } catch (error) {
      if (consentError(error)) throw error;
      console.error('postOpenQuestions failed', error?.message || error);
      return { status: 'error', error: 'Jira did not accept the comment. Nothing was posted.' };
    }
    if (!posted.ok) return { status: 'error', error: posted.message };

    const updated = markPosted(history, entryId, posted);
    try {
      await saveHistory(issueKey, updated);
    } catch (error) {
      console.error('postOpenQuestions history write failed', error?.message || error);
    }
    console.log(`postOpenQuestions ok ${issueKey} comment ${posted.commentId}`);
    return {
      status: 'success',
      commentUrl: posted.commentUrl,
      history: updated,
      changes: changesSincePrevious(updated),
    };
  },

  ping: async () => ({
    status: 'ok',
    app: 'ayra-meetbrief-forge',
    version: '0.3.0',
  }),
});
