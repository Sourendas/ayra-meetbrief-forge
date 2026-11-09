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
