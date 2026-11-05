import { fetchIssueContext, searchConfluencePages } from './lib/atlassian.js';
import { agentIssueMessage, agentPagesMessage, assembleBriefFromInputs } from './lib/brief.js';
import { normalizeSpaceKey, parseBriefContext, readInput, readIssueKeyFromPayload } from './lib/text.js';

/**
 * Rovo action: read a real Jira work item.
 * Uses the app user first (Rovo actions are not UI Kit modules). Falls back to the
 * current user inside fetchIssueContext. On failure the payload says what failed.
 */
export async function gatherIssueContext(payload) {
  const issueKey = readIssueKeyFromPayload(payload);
  if (!issueKey) {
    return {
      status: 'error',
      issueContext: null,
      error: 'Pass an issue key such as PROJ-123.',
      message:
        'No Jira issue key was provided. Ask for a key like PROJ-123. Do not invent a summary, status, or URL.',
    };
  }

  try {
    const fetched = await fetchIssueContext(issueKey, { auth: 'app' });
    if (!fetched.ok) {
      return {
        status: 'partial',
        issueContext: null,
        error: fetched.message,
        message: `Could not read ${issueKey}. ${fetched.message} Do not invent fields.`,
      };
    }
    return {
      status: 'success',
      issueContext: fetched.issue,
      message: agentIssueMessage(fetched.issue),
    };
  } catch (error) {
    console.error('gatherIssueContext failed', error?.message || error);
    return {
      status: 'error',
      issueContext: null,
      error: 'Jira request failed before a response arrived.',
      message: `Could not read ${issueKey}. The Jira request failed. Do not invent fields.`,
    };
  }
}

/**
 * Rovo action: search Confluence pages. Empty and failed searches stay explicit.
 */
export async function gatherPageContext(payload) {
  const query = String(readInput(payload, 'query') || payload?.context?.confluence?.title || '').trim();
  const rawSpace = String(readInput(payload, 'spaceKey') || payload?.context?.confluence?.spaceKey || '').trim();
  const spaceKey = normalizeSpaceKey(rawSpace);
  const spaceNote =
    rawSpace && !spaceKey ? ' Space key was ignored because it was not a Confluence space key.' : '';
  if (!query) {
    return {
      status: 'error',
      pageContext: { query: '', pages: [] },
      error: 'query is required',
      message: 'No Confluence query was provided. Ask for a topic or page title. Do not invent pages.',
    };
  }

  try {
    const searched = await searchConfluencePages(query, spaceKey, { auth: 'app' });
    if (!searched.ok) {
      const pageContext = { query, spaceKey: spaceKey || null, pages: [], error: searched.message };
      return {
        status: 'partial',
        pageContext,
        error: searched.message,
        message: `${searched.message} Continue without Confluence pages. Do not invent titles or URLs.${spaceNote}`,
      };
    }
    const pageContext = { query: searched.query, spaceKey: searched.spaceKey, pages: searched.pages };
    return {
      status: searched.pages.length ? 'success' : 'partial',
      pageContext,
      message: `${agentPagesMessage(pageContext)}${spaceNote}`,
    };
  } catch (error) {
    console.error('gatherPageContext failed', error?.message || error);
    return {
      status: 'error',
      pageContext: { query, spaceKey: spaceKey || null, pages: [] },
      error: 'Confluence request failed before a response arrived.',
      message: 'Confluence search failed. Continue without pages. Do not invent titles or URLs.',
    };
  }
}

/**
 * Rovo action: format whatever the gather actions actually returned.
 * A missing or invalid context still returns a template brief and says so.
 */
export async function assembleBrief(payload) {
  const subject = String(readInput(payload, 'subject') || '').trim();
  if (!subject) {
    return {
      status: 'error',
      error: 'subject is required',
      message: 'A subject is required before a brief can be assembled.',
    };
  }

  const raw = readInput(payload, 'contextJson');
  let issueContext = null;
  let pageContext = null;
  let attached = false;
  if (raw) {
    try {
      const parsed = parseBriefContext(raw);
      issueContext = parsed.issueContext;
      pageContext = parsed.pageContext;
      attached = parsed.attached;
    } catch {
      return {
        status: 'error',
        error: 'contextJson must be valid JSON from a gather action.',
        message: 'contextJson was not valid JSON. Pass the gather action result, or omit it.',
      };
    }
  }

  const warnings = attached
    ? []
    : ['No gather-action context was attached. This is a seat template, not a workspace read.'];

  const brief = assembleBriefFromInputs({
    subject,
    role: readInput(payload, 'role') || 'teammate',
    meetingLabel: readInput(payload, 'meetingLabel') || '',
    objective: readInput(payload, 'objective') || '',
    issueContext,
    pageContext,
    warnings,
  });

  return {
    status: 'success',
    brief,
    contextAttached: attached,
    message: attached
      ? `Assembled a workspace brief for ${subject}. Use only the sources in the brief.`
      : `Assembled a template brief for ${subject}. Workspace context was not attached, so say that.`,
  };
}
