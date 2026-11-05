import api, { route } from '@forge/api';
import { assembleBriefFromInputs } from './lib/brief.js';

function excerptText(value, max = 400) {
  if (!value) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

/**
 * Rovo action: gather Jira issue context for a meeting brief.
 */
export async function gatherIssueContext(payload) {
  const issueKey = payload?.issueKey || payload?.inputs?.issueKey;
  if (!issueKey) {
    return { status: 'error', error: 'issueKey is required' };
  }

  try {
    const response = await api
      .asUser()
      .requestJira(
        route`/rest/api/3/issue/${issueKey}?fields=summary,status,description,comment`,
        { headers: { Accept: 'application/json' } }
      );

    if (!response.ok) {
      const body = await response.text();
      return {
        status: 'error',
        error: `Jira API ${response.status}: ${excerptText(body, 200)}`,
      };
    }

    const data = await response.json();
    const fields = data.fields || {};
    const comments = (fields.comment?.comments || [])
      .slice(-3)
      .map((c) => excerptText(c.body?.content ? JSON.stringify(c.body) : c.body, 160));

    const context = {
      key: data.key,
      summary: fields.summary || '',
      status: fields.status?.name || '',
      descriptionExcerpt: excerptText(
        typeof fields.description === 'string'
          ? fields.description
          : JSON.stringify(fields.description || ''),
        500
      ),
      comments,
      url: data.self || '',
    };

    return {
      status: 'success',
      issueContext: context,
      message: `Loaded ${context.key}: ${context.summary}`,
      // Teamwork Graph hook (Preview): call api.asUser().requestTeamworkGraph(...) once allowlisted.
      teamworkGraph: {
        status: 'stub',
        note: 'Scopes read:graph:jira / read:graph:confluence are declared. Wire requestTeamworkGraph after allowlist.',
      },
    };
  } catch (error) {
    console.error('gatherIssueContext failed', error);
    return { status: 'error', error: 'Failed to gather Jira issue context.' };
  }
}

/**
 * Rovo action: search Confluence for related pages.
 */
export async function gatherPageContext(payload) {
  const query = payload?.query || payload?.inputs?.query;
  const spaceKey = payload?.spaceKey || payload?.inputs?.spaceKey;
  if (!query) {
    return { status: 'error', error: 'query is required' };
  }

  try {
    let cql = `type=page AND text ~ "${String(query).replace(/"/g, '\\"')}"`;
    if (spaceKey) {
      cql = `space="${String(spaceKey).replace(/"/g, '')}" AND ${cql}`;
    }

    const response = await api
      .asUser()
      .requestConfluence(
        route`/wiki/rest/api/content/search?cql=${cql}&limit=5&expand=body.view,space`,
        { headers: { Accept: 'application/json' } }
      );

    if (!response.ok) {
      // Soft-fail so the agent can still assemble a template brief.
      const body = await response.text();
      return {
        status: 'partial',
        pages: [],
        error: `Confluence search ${response.status}: ${excerptText(body, 200)}`,
        message: 'No Confluence pages returned; continue with issue context only.',
      };
    }

    const data = await response.json();
    const pages = (data.results || []).map((page) => ({
      id: page.id,
      title: page.title,
      spaceKey: page.space?.key,
      excerpt: excerptText(page.body?.view?.value?.replace(/<[^>]+>/g, ' ') || '', 280),
      url: page._links?.webui
        ? page._links.webui
        : page._links?.self || '',
    }));

    return {
      status: 'success',
      pageContext: { query, spaceKey: spaceKey || null, pages },
      message: `Found ${pages.length} Confluence page(s) for "${query}"`,
      teamworkGraph: {
        status: 'stub',
        note: 'Use Teamwork Graph curated queries to traverse page ↔ issue links when allowlisted.',
      },
    };
  } catch (error) {
    console.error('gatherPageContext failed', error);
    return { status: 'error', error: 'Failed to gather Confluence page context.' };
  }
}

/**
 * Rovo action: format gathered context into a MeetBrief one-pager.
 */
export async function assembleBrief(payload) {
  const subject = payload?.subject || payload?.inputs?.subject;
  if (!subject) {
    return { status: 'error', error: 'subject is required' };
  }

  let issueContext = null;
  let pageContext = null;
  const raw = payload?.contextJson || payload?.inputs?.contextJson;
  if (raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      issueContext = parsed.issueContext || parsed.issue || null;
      pageContext = parsed.pageContext || parsed.pages ? { pages: parsed.pages } : parsed.pageContext;
      if (parsed.pages && !pageContext) {
        pageContext = { pages: parsed.pages };
      }
    } catch (e) {
      return { status: 'error', error: 'contextJson must be valid JSON' };
    }
  }

  const brief = assembleBriefFromInputs({
    subject,
    role: payload?.role || payload?.inputs?.role || 'teammate',
    meetingLabel: payload?.meetingLabel || payload?.inputs?.meetingLabel || '',
    objective: payload?.objective || payload?.inputs?.objective || '',
    issueContext,
    pageContext,
  });

  return { status: 'success', brief };
}
