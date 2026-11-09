/**
 * Jira and Confluence reads for the issue panel, the Confluence page, and Rovo actions.
 * Failures return a message the UI and the agent can show. They do not invent fields.
 */

import forgeApi, { route } from '@forge/api';

// Default import can be the API object or, under ESM interop, the module namespace.
const api = typeof forgeApi?.asUser === 'function' ? forgeApi : forgeApi?.default;
import {
  absoluteWikiUrl,
  adfToText,
  browseUrlFromSelf,
  clip,
  cqlPhrase,
  normalizeIssueKey,
  normalizeSpaceKey,
  originOf,
  stripHtml,
} from './text.js';
import { isMeetBriefComment } from './history.js';

const JSON_HEADERS = { headers: { Accept: 'application/json' } };

function isConsentError(error) {
  const msg = String(error?.message || error || '');
  return /401|unauthorized|not authorized|consent|authorization header/i.test(msg);
}

function failureMessage(product, status, body, fallback) {
  const detail = clip(stripHtml(body || ''), 160);
  if (status === 404) {
    return product === 'jira'
      ? 'Jira could not find that work item, or you cannot view it.'
      : 'Confluence search is not available on this site.';
  }
  if (status === 401 || status === 403) {
    return `${product === 'jira' ? 'Jira' : 'Confluence'} declined the read (${status}). ${fallback}`;
  }
  if (detail) return `${product === 'jira' ? 'Jira' : 'Confluence'} returned ${status}: ${detail}`;
  return fallback;
}

/**
 * @param {'jira'|'confluence'} product
 * @param {string} path route`` result
 * @param {'user'|'app'} auth UI modules use the current user. Rovo actions prefer the app user.
 */
async function requestProduct(product, path, auth) {
  const modes = auth === 'app' ? ['app', 'user'] : ['user'];
  let lastHttp = null;

  for (const mode of modes) {
    try {
      const client = mode === 'app' ? api.asApp() : api.asUser();
      const response =
        product === 'jira'
          ? await client.requestJira(path, JSON_HEADERS)
          : await client.requestConfluence(path, JSON_HEADERS);
      if (response.ok) return { ok: true, response };
      const body = await response.text();
      lastHttp = { status: response.status, body };
      if (response.status !== 401 && response.status !== 403) break;
    } catch (error) {
      if (auth === 'user' && isConsentError(error)) throw error;
      if (!lastHttp) lastHttp = { status: 0, body: String(error?.message || '') };
    }
  }

  return {
    ok: false,
    status: lastHttp?.status || 0,
    message: failureMessage(
      product,
      lastHttp?.status || 0,
      lastHttp?.body || '',
      product === 'jira'
        ? 'The brief will stay template-only for Jira until the read succeeds.'
        : 'The brief will continue without Confluence pages.'
    ),
  };
}

function mapComment(comment, browseUrl) {
  const text = adfToText(comment?.body, 180);
  if (!text || isMeetBriefComment(text)) return null;
  const id = comment?.id;
  return {
    id: id || '',
    author: comment?.author?.displayName || 'Someone',
    text,
    created: comment?.created || '',
    url: browseUrl && id ? `${browseUrl}?focusedCommentId=${id}` : browseUrl || '',
  };
}

function mapLink(link) {
  const target = link?.outwardIssue || link?.inwardIssue;
  if (!target?.key) return null;
  const relation = link.outwardIssue ? link.type?.outward : link.type?.inward;
  return {
    key: target.key,
    summary: target.fields?.summary || '',
    status: target.fields?.status?.name || '',
    relation: relation || 'relates to',
  };
}

export function mapIssue(data, siteBase) {
  const fields = data?.fields || {};
  const key = data?.key || '';
  const url = browseUrlFromSelf(data?.self, key, siteBase);
  const comments = (fields.comment?.comments || [])
    .slice(-3)
    .map((comment) => mapComment(comment, url))
    .filter(Boolean);
  const links = (fields.issuelinks || []).map(mapLink).filter(Boolean).slice(0, 6);
  const parent = fields.parent?.key
    ? { key: fields.parent.key, summary: fields.parent.fields?.summary || '' }
    : null;

  return {
    key,
    summary: fields.summary || '',
    status: fields.status?.name || '',
    statusCategory: fields.status?.statusCategory?.key || '',
    issueType: fields.issuetype?.name || '',
    priority: fields.priority?.name || '',
    assignee: fields.assignee?.displayName || '',
    updated: fields.updated || '',
    labels: Array.isArray(fields.labels) ? fields.labels.slice(0, 8) : [],
    descriptionExcerpt: adfToText(fields.description, 420),
    comments,
    links,
    parent,
    url,
  };
}

export function mapSearchResults(data) {
  const base = data?._links?.base || '';
  const origin = originOf(base);
  return (data?.results || []).map((item) => {
    const content = item.content || item;
    const webui = item.url || content?._links?.webui || '';
    const spaceKey = content?.space?.key || item.space?.key || '';
    const spaceName = item.resultGlobalContainer?.title || spaceKey;
    return {
      id: String(content?.id || item.id || ''),
      title: item.title || content?.title || 'Untitled page',
      spaceKey,
      spaceName,
      excerpt: stripHtml(item.excerpt || ''),
      url: absoluteWikiUrl(base || origin, webui),
    };
  });
}

export async function fetchIssueContext(issueKey, { auth = 'user', siteBase } = {}) {
  const key = normalizeIssueKey(issueKey);
  if (!key) {
    return {
      ok: false,
      message: 'Issue key should look like PROJ-123. Jira was not queried.',
    };
  }

  const fields =
    'summary,status,description,comment,issuetype,priority,assignee,updated,issuelinks,labels,parent';
  const result = await requestProduct(
    'jira',
    route`/rest/api/3/issue/${key}?fields=${fields}`,
    auth
  );
  if (!result.ok) return { ok: false, message: result.message };

  const data = await result.response.json();
  const issue = mapIssue(data, siteBase);
  if (!issue.key) {
    return { ok: false, message: `Jira returned a payload without a key for ${key}.` };
  }
  return { ok: true, issue };
}

export async function searchConfluencePages(query, spaceKey, { auth = 'user' } = {}) {
  const phrase = cqlPhrase(query);
  if (!phrase) {
    return { ok: false, message: 'No Confluence query to search.' };
  }
  const space = normalizeSpaceKey(spaceKey);
  let cql = `type = page AND text ~ "${phrase}"`;
  if (space) cql = `space = "${space}" AND ${cql}`;

  const params = new URLSearchParams({ cql, limit: '5' });
  const result = await requestProduct('confluence', route`/wiki/rest/api/search?${params}`, auth);
  if (!result.ok) return { ok: false, message: result.message };

  const data = await result.response.json();
  const pages = mapSearchResults(data).filter((page) => page.title);
  return { ok: true, query: phrase, spaceKey: space || null, pages };
}

/**
 * Write-back: add a comment to the work item as the signed-in user (scope write:jira-work).
 * Only called when the user clicks "Post open questions". Returns the new comment link.
 */
export async function postIssueComment(issueKey, adfBody, { siteBase } = {}) {
  const key = normalizeIssueKey(issueKey);
  if (!key) return { ok: false, message: 'Issue key should look like PROJ-123. Nothing was posted.' };
  if (!adfBody) return { ok: false, message: 'There are no open questions to post.' };

  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${key}/comment`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: adfBody }),
  });
  if (!response.ok) {
    const body = await response.text();
    return {
      ok: false,
      status: response.status,
      message: failureMessage(
        'jira',
        response.status,
        body,
        'Jira did not accept the comment. Check that you can comment on this work item.'
      ).replace('declined the read', 'declined the comment'),
    };
  }
  const data = await response.json();
  const browse = browseUrlFromSelf(data?.self, key, siteBase);
  return {
    ok: true,
    commentId: String(data?.id || ''),
    commentUrl: browse && data?.id ? `${browse}?focusedCommentId=${data.id}` : browse,
  };
}
