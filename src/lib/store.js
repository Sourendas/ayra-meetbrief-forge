/**
 * Forge Key-Value Store wrapper for brief history (scope storage:app).
 * Storage failures never block a brief; callers get an empty history and a logged error.
 */

import * as kvsModule from '@forge/kvs';
import { historyKey, postedKey, sanitizeHistory, sanitizeLedger } from './history.js';

const kvs = kvsModule.kvs || kvsModule.default?.kvs || kvsModule.default;

export async function loadHistory(issueKey) {
  const key = historyKey(issueKey);
  if (!key) return [];
  const value = await kvs.get(key);
  return sanitizeHistory(value);
}

export async function saveHistory(issueKey, history) {
  const key = historyKey(issueKey);
  if (!key) return;
  await kvs.set(key, sanitizeHistory(history));
}

export async function loadLedger(issueKey) {
  const key = postedKey(issueKey);
  if (!key) return sanitizeLedger(null);
  return sanitizeLedger(await kvs.get(key));
}

export async function saveLedger(issueKey, ledger) {
  const key = postedKey(issueKey);
  if (!key) return;
  await kvs.set(key, sanitizeLedger(ledger));
}

/**
 * Per-issue post lock. kvs FAIL_IF_EXISTS makes the claim atomic, so two clicks that
 * race past the ledger check still make one Jira call. The TTL frees a lock left by a crash.
 * Returns 'acquired', 'locked', or 'unavailable' (lock API errored for another reason).
 */
function lockKey(issueKey) {
  const key = postedKey(issueKey);
  return key ? key.replace('brief-posted:', 'brief-post-lock:') : '';
}

export async function acquirePostLock(issueKey, owner) {
  const key = lockKey(issueKey);
  if (!key) return 'unavailable';
  try {
    await kvs.set(key, { owner, at: new Date().toISOString() }, { keyPolicy: 'FAIL_IF_EXISTS', ttl: { value: 60, unit: 'SECONDS' } });
    return 'acquired';
  } catch (error) {
    const text = `${error?.code || ''} ${error?.message || ''}`;
    if (/exist|conflict|409|precondition/i.test(text)) return 'locked';
    console.error('post lock unavailable', text);
    return 'unavailable';
  }
}

export async function releasePostLock(issueKey) {
  const key = lockKey(issueKey);
  if (key) await kvs.delete(key);
}
