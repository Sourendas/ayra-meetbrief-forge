/**
 * Brief history per Jira work item, and the Jira comment MeetBrief posts on request.
 * Pure functions only. Storage and HTTP live in store.js and atlassian.js so this file
 * stays testable without Forge.
 */

import { clip, normalizeIssueKey } from './text.js';

export const HISTORY_LIMIT = 5;

export function historyKey(issueKey) {
  const key = normalizeIssueKey(issueKey);
  return key ? `brief-history:${key}` : '';
}

function fingerprint(entry) {
  return JSON.stringify([
    entry.role,
    entry.objective,
    entry.meetingLabel,
    entry.status,
    entry.openQuestions,
  ]);
}

function shortId(now) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${now.getTime().toString(36)}-${random}`;
}

/** The slice of a brief worth keeping. No comment bodies or page excerpts are stored. */
export function historyEntryFromBrief(brief, { now = new Date(), id } = {}) {
  return {
    id: id || shortId(now),
    generatedAt: now.toISOString(),
    role: brief.role || 'teammate',
    seatLabel: brief.seatLabel || 'Teammate',
    meetingLabel: clip(brief.meetingLabel || '', 120),
    objective: clip(brief.objective || '', 200),
    status: brief.issue?.status || '',
    openQuestions: (brief.openQuestions || []).slice(0, 6).map((line) => clip(line, 240)),
    sourceCount: (brief.sources || []).length,
    engine: brief.engine || 'template-v1',
    commentId: '',
    commentUrl: '',
    postedAt: '',
  };
}

export function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry.id === 'string').slice(0, HISTORY_LIMIT);
}

/**
 * Newest first. Rebuilding the same brief (same seat, objective, meeting, status, questions)
 * refreshes the timestamp instead of filling history with copies; a posted comment stays linked.
 */
export function mergeHistory(existing, entry, limit = HISTORY_LIMIT) {
  const list = sanitizeHistory(existing);
  const [latest, ...rest] = list;
  if (latest && fingerprint(latest) === fingerprint(entry)) {
    const refreshed = { ...latest, generatedAt: entry.generatedAt, sourceCount: entry.sourceCount, engine: entry.engine };
    return { history: [refreshed, ...rest].slice(0, limit), entry: refreshed, deduped: true };
  }
  return { history: [entry, ...list].slice(0, limit), entry, deduped: false };
}

/** What moved since the previous brief on this work item. Every line comes from stored entries. */
export function changesSincePrevious(history) {
  const [current, previous] = sanitizeHistory(history);
  if (!current || !previous) return [];
  const when = String(previous.generatedAt || '').slice(0, 10);
  const lines = [];
  if (previous.status && current.status && previous.status !== current.status) {
    lines.push(`Status moved ${previous.status} → ${current.status} since the brief on ${when}.`);
  }
  const before = new Set(previous.openQuestions || []);
  const after = new Set(current.openQuestions || []);
  const resolved = [...before].filter((line) => !after.has(line));
  const added = [...after].filter((line) => !before.has(line));
  if (resolved.length) {
    lines.push(`${resolved.length} open question${resolved.length === 1 ? '' : 's'} from ${when} no longer appear${resolved.length === 1 ? 's' : ''}.`);
  }
  if (added.length) {
    lines.push(`${added.length} new open question${added.length === 1 ? '' : 's'} since ${when}.`);
  }
  if (previous.commentUrl) {
    lines.push(`Open questions from ${when} were posted to Jira.`);
  }
  return lines;
}

export function markPosted(history, entryId, { commentId, commentUrl, now = new Date() }) {
  return sanitizeHistory(history).map((entry) =>
    entry.id === entryId
      ? { ...entry, commentId: String(commentId || ''), commentUrl: commentUrl || '', postedAt: now.toISOString() }
      : entry
  );
}

function textNode(text, marks) {
  return marks ? { type: 'text', text, marks } : { type: 'text', text };
}

/** Atlassian Document Format body for the "Open questions" comment. */
export function openQuestionsCommentAdf(entry, issueKey) {
  const questions = (entry?.openQuestions || []).filter(Boolean);
  if (!questions.length) return null;
  const heading = [textNode('MeetBrief — open questions', [{ type: 'strong' }])];
  const context = [entry.meetingLabel && `Meeting: ${entry.meetingLabel}`, `Seat: ${entry.seatLabel || 'Teammate'}`, entry.objective && `Objective: ${entry.objective}`]
    .filter(Boolean)
    .join(' · ');
  return {
    version: 1,
    type: 'doc',
    content: [
      { type: 'paragraph', content: heading },
      { type: 'paragraph', content: [textNode(context)] },
      {
        type: 'bulletList',
        content: questions.map((line) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [textNode(line)] }],
        })),
      },
      {
        type: 'paragraph',
        content: [
          textNode(
            `Posted from the MeetBrief panel on ${normalizeIssueKey(issueKey) || 'this work item'} so answers land on the work item, not in someone’s notes. Reply here or update the description.`,
            [{ type: 'em' }]
          ),
        ],
      },
    ],
  };
}

/*
 * Posted ledger: one kvs record per work item (`brief-posted:KEY`), separate from history.
 * generateBrief never writes it, so a rebuild cannot clobber a posted marker, and the guard
 * covers every brief on the issue, not just the entry id the panel happens to hold.
 */
export const POST_PENDING_MS = 60000;
export const COMMENT_MARKER = 'MeetBrief — open questions';

export function postedKey(issueKey) {
  const key = normalizeIssueKey(issueKey);
  return key ? `brief-posted:${key}` : '';
}

export function normalizeQuestion(line) {
  return String(line || '')
    .toLowerCase()
    .replace(/\(\d+ days? ago\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function sanitizeLedger(value) {
  const ledger = value && typeof value === 'object' ? value : {};
  return {
    questions: Array.isArray(ledger.questions) ? ledger.questions.filter((q) => typeof q === 'string') : [],
    posts: Array.isArray(ledger.posts) ? ledger.posts.filter((p) => p && typeof p.entryId === 'string') : [],
    pending: ledger.pending && typeof ledger.pending.entryId === 'string' ? ledger.pending : null,
  };
}

/** Questions on this entry that no MeetBrief comment on the issue has carried yet. */
export function unpostedQuestions(entry, ledger) {
  const seen = new Set(sanitizeLedger(ledger).questions);
  return (entry?.openQuestions || []).filter((line) => line && !seen.has(normalizeQuestion(line)));
}

/**
 * Decide before calling Jira. Returns { action: 'post', questions } or
 * { action: 'skip', status, commentUrl, error }.
 */
export function postDecision(entry, ledger, now = new Date()) {
  const clean = sanitizeLedger(ledger);
  const prior = clean.posts.find((post) => post.entryId === entry.id);
  const last = clean.posts[clean.posts.length - 1];
  if (prior || entry.commentUrl) {
    return { action: 'skip', status: 'already-posted', commentUrl: prior?.commentUrl || entry.commentUrl || '' };
  }
  if (clean.pending && now.getTime() - Date.parse(clean.pending.at || 0) < POST_PENDING_MS) {
    return { action: 'skip', status: 'in-progress', error: 'A post for this work item is already in progress. Wait a moment.' };
  }
  const questions = unpostedQuestions(entry, clean);
  if (!(entry.openQuestions || []).length) {
    return { action: 'skip', status: 'error', error: 'This brief has no open questions to post.' };
  }
  if (!questions.length) {
    return { action: 'skip', status: 'already-posted', commentUrl: last?.commentUrl || '' };
  }
  return { action: 'post', questions };
}

export function markPending(ledger, entryId, now = new Date()) {
  return { ...sanitizeLedger(ledger), pending: { entryId, at: now.toISOString() } };
}

export function recordPost(ledger, entryId, questions, { commentId, commentUrl, now = new Date() }) {
  const clean = sanitizeLedger(ledger);
  const merged = new Set(clean.questions);
  for (const line of questions) merged.add(normalizeQuestion(line));
  return {
    questions: [...merged].slice(-60),
    posts: [...clean.posts, { entryId, commentId: String(commentId || ''), commentUrl: commentUrl || '', postedAt: now.toISOString() }].slice(-20),
    pending: null,
  };
}

/** MeetBrief's own comments are not meeting context; leaving them in would change the next brief. */
export function isMeetBriefComment(text) {
  return String(text || '').trim().startsWith(COMMENT_MARKER);
}

/** Fold posts recorded only on history entries (pre-ledger builds) into the ledger. */
export function seedLedgerFromHistory(ledger, history) {
  let clean = sanitizeLedger(ledger);
  for (const entry of sanitizeHistory(history).slice().reverse()) {
    if (!entry.commentId && !entry.commentUrl) continue;
    if (clean.posts.some((post) => post.entryId === entry.id)) continue;
    const pending = clean.pending;
    clean = { ...recordPost(clean, entry.id, entry.openQuestions || [], { commentId: entry.commentId, commentUrl: entry.commentUrl, now: new Date(entry.postedAt || entry.generatedAt || Date.now()) }), pending };
  }
  return clean;
}
