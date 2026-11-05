import { makeResolver } from '@forge/resolver';
import { fetchIssueContext, searchConfluencePages } from '../lib/atlassian.js';
import { assembleBriefFromInputs } from '../lib/brief.js';
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

    return {
      status: 'success',
      brief,
      context: {
        issueKey: issueKey || null,
        surface: issueKey && !requestedKey ? 'jira' : context?.extension?.type || null,
      },
    };
  },

  ping: async () => ({
    status: 'ok',
    app: 'ayra-meetbrief-forge',
    version: '0.2.0',
  }),
});
