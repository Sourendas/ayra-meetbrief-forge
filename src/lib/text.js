/**
 * Small text helpers shared by the brief assembler and the Jira/Confluence mappers.
 * No network, no secrets.
 */

export function clip(value, max = 400) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, Math.max(1, max - 1))}…`;
}

export function stripHtml(value) {
  return clip(
    String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
    2000
  );
}

function walkAdf(node, parts) {
  if (!node) return;
  if (typeof node === 'string') {
    parts.push(node);
    return;
  }
  if (node.type === 'text' && node.text) parts.push(node.text);
  if (node.type === 'hardBreak') parts.push('\n');
  if (node.type === 'mention' && node.attrs?.text) parts.push(node.attrs.text);
  if (node.type === 'emoji') parts.push(node.attrs?.text || node.attrs?.shortName || '');
  if (node.type === 'inlineCard' && node.attrs?.url) parts.push(node.attrs.url);
  if (Array.isArray(node.content)) {
    for (const child of node.content) walkAdf(child, parts);
  }
}

/** Plain text from an Atlassian Document Format node, or from a string. */
export function adfToText(node, max = 500) {
  if (!node) return '';
  if (typeof node === 'string') return clip(stripHtml(node), max);
  const parts = [];
  walkAdf(node, parts);
  return clip(parts.join(' '), max);
}

export function normalizeIssueKey(value) {
  const key = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,20}-\d{1,8}$/.test(key)) return '';
  return key;
}

export function normalizeSpaceKey(value) {
  const key = String(value ?? '').trim();
  if (!key) return '';
  if (!/^[A-Za-z0-9_~]{1,40}$/.test(key)) return '';
  return key;
}

/** Phrase safe to drop inside a CQL double-quoted string. */
export function cqlPhrase(value) {
  return clip(String(value || '').replace(/["\\]/g, ' '), 80);
}

/**
 * Build https://<site>.atlassian.net/browse/KEY for Sources and comment links.
 * Forge requestJira often returns self as https://api.atlassian.com/ex/jira/<cloudId>/...
 * Using that origin would emit api.atlassian.com/browse/KEY, which is not a site UI.
 * Prefer an explicit siteBase (resolver context.siteUrl / payload.siteUrl); never emit the API host.
 */
export function browseUrlFromSelf(selfUrl, issueKey, siteBase) {
  if (!issueKey) return '';
  const key = String(issueKey);

  const fromBase = (base) => {
    if (!base) return '';
    try {
      const parsed = new URL(base);
      if (!parsed.origin || parsed.hostname === 'api.atlassian.com') return '';
      return `${parsed.origin}/browse/${key}`;
    } catch {
      return '';
    }
  };

  const preferred = fromBase(siteBase);
  if (preferred) return preferred;

  if (!selfUrl) return '';
  try {
    const url = new URL(selfUrl);
    if (url.hostname === 'api.atlassian.com') return '';
    return `${url.origin}/browse/${key}`;
  } catch {
    return '';
  }
}

export function originOf(url) {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export function absoluteWikiUrl(base, webui) {
  if (!webui) return '';
  if (/^https?:\/\//i.test(webui)) return webui;
  if (!base) return '';
  try {
    const baseUrl = new URL(base);
    if (webui.startsWith('/wiki/') || webui === '/wiki') {
      return `${baseUrl.origin}${webui}`;
    }
    const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${prefix}${webui.startsWith('/') ? webui : `/${webui}`}`;
  } catch {
    return '';
  }
}

export function formatWhen(iso) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return '';
  return `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function readInput(payload, name) {
  if (!payload || typeof payload !== 'object') return undefined;
  const direct = payload[name];
  if (direct != null && direct !== '') return direct;
  const nested = payload.inputs?.[name];
  if (nested != null && nested !== '') return nested;
  return undefined;
}

export function readIssueKeyFromPayload(payload) {
  const candidates = [
    readInput(payload, 'issueKey'),
    payload?.context?.jira?.issueKey,
  ];
  const url = payload?.context?.jira?.url;
  if (typeof url === 'string') {
    const match = url.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/i);
    if (match) candidates.push(match[1]);
  }
  for (const candidate of candidates) {
    const key = normalizeIssueKey(candidate);
    if (key) return key;
  }
  return '';
}

/**
 * Accepts the JSON string Rovo passes between actions, or an already-parsed object.
 * Throws if a non-empty string is not JSON.
 */
export function parseBriefContext(raw) {
  if (raw == null || raw === '') {
    return { issueContext: null, pageContext: null, attached: false };
  }
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== 'object') {
    return { issueContext: null, pageContext: null, attached: false };
  }
  const issueContext = parsed.issueContext || parsed.issue || null;
  let pageContext = parsed.pageContext || null;
  if (!pageContext && Array.isArray(parsed.pages)) {
    pageContext = { pages: parsed.pages, query: parsed.query || '' };
  }
  return {
    issueContext,
    pageContext,
    attached: Boolean(issueContext || (pageContext && pageContext.pages)),
  };
}
