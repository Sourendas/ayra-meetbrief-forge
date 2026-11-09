/**
 * Forge Key-Value Store wrapper for brief history (scope storage:app).
 * Storage failures never block a brief; callers get an empty history and a logged error.
 */

import * as kvsModule from '@forge/kvs';
import { historyKey, sanitizeHistory } from './history.js';

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
