// Resolver flow with Jira, Confluence, and Forge KVS mocked. Run via `npm test`
// (needs --experimental-test-module-mocks, set in package.json).
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const store = new Map();
const ledgers = new Map();
const locks = new Set();
const posted = [];
let issueComments = [];
const tick = () => new Promise((resolve) => setImmediate(resolve));

mock.module('../lib/store.js', {
  namedExports: {
    loadHistory: async (key) => {
      await tick();
      return structuredClone(store.get(key) || []);
    },
    saveHistory: async (key, value) => {
      await tick();
      store.set(key, structuredClone(value));
    },
    loadLedger: async (key) => {
      await tick();
      return structuredClone(ledgers.get(key) || { questions: [], posts: [], pending: null });
    },
    saveLedger: async (key, value) => {
      await tick();
      ledgers.set(key, structuredClone(value));
    },
    acquirePostLock: async (key) => {
      await tick();
      if (locks.has(key)) return 'locked';
      locks.add(key);
      return 'acquired';
    },
    releasePostLock: async (key) => {
      locks.delete(key);
    },
  },
});

mock.module('../lib/atlassian.js', {
  namedExports: {
    fetchIssueContext: async (key) => ({
      ok: true,
      issue: {
        key,
        summary: 'Checkout times out',
        status: 'In Progress',
        statusCategory: 'indeterminate',
        issueType: 'Bug',
        priority: 'High',
        assignee: '',
        updated: new Date().toISOString(),
        descriptionExcerpt: 'Spinner after paying.',
        url: `https://ayra-dev.atlassian.net/browse/${key}`,
        comments: issueComments,
        links: [],
        labels: ['customer'],
      },
    }),
    searchConfluencePages: async (query) => ({ ok: true, query, spaceKey: null, pages: [] }),
    postIssueComment: async (key, adf) => {
      await tick();
      posted.push({ key, adf });
      const id = String(42 + posted.length - 1);
      // Real Jira: the issue now has a comment and a fresh updated time, so the next brief differs.
      issueComments = [{ author: 'Teammate', text: 'Replying to the questions.', url: '' }];
      return { ok: true, commentId: id, commentUrl: `https://ayra-dev.atlassian.net/browse/${key}?focusedCommentId=${id}` };
    },
  },
});

const { handler } = await import('./index.js');

function reset() {
  store.clear();
  ledgers.clear();
  locks.clear();
  posted.length = 0;
  issueComments = [];
}

function call(functionKey, payload) {
  return handler({ call: { functionKey, payload }, context: { extension: { issue: { key: 'KAN-7' } } } });
}

test('generateBrief saves history, dedupes rebuilds, and posts open questions once', async () => {
  reset();
  const first = await call('generateBrief', { issueKey: 'KAN-7', role: 'teammate' });
  assert.equal(first.status, 'success');
  assert.equal(first.history.length, 1);
  assert.ok(first.historyEntryId);
  assert.ok(first.brief.discussionPoints.some((line) => /bug/.test(line)));
  assert.ok(first.brief.discussionPoints.some((line) => /Customer-facing/.test(line)));

  const again = await call('generateBrief', { issueKey: 'KAN-7', role: 'teammate' });
  assert.equal(again.history.length, 1);
  assert.equal(again.historyEntryId, first.historyEntryId);

  const out = await call('postOpenQuestions', { issueKey: 'KAN-7', historyEntryId: first.historyEntryId });
  assert.equal(out.status, 'success');
  assert.match(out.commentUrl, /focusedCommentId=42/);
  assert.equal(posted.length, 1);
  assert.equal(store.get('KAN-7')[0].commentId, '42');

  const twice = await call('postOpenQuestions', { issueKey: 'KAN-7', historyEntryId: first.historyEntryId });
  assert.equal(twice.status, 'already-posted');
  assert.equal(posted.length, 1);

  const investor = await call('generateBrief', { issueKey: 'KAN-7', role: 'investor', objective: 'Ship date' });
  assert.equal(investor.history.length, 2);
  assert.equal(investor.history[1].commentId, '42');

  const history = await call('getHistory', { issueKey: 'KAN-7' });
  assert.equal(history.history.length, 2);

  const missing = await call('postOpenQuestions', { issueKey: 'KAN-7', historyEntryId: 'nope' });
  assert.equal(missing.status, 'error');
});

test('regression: post, rebuild, post again on KAN-1 makes exactly one Jira POST', async () => {
  reset();
  const first = await call('generateBrief', { issueKey: 'KAN-1', role: 'teammate' });
  const one = await call('postOpenQuestions', { issueKey: 'KAN-1', historyEntryId: first.historyEntryId });
  assert.equal(one.status, 'success');
  assert.equal(posted.length, 1);

  // The posted comment changes the issue, so the rebuilt brief is a new history entry with a new id.
  const rebuilt = await call('generateBrief', { issueKey: 'KAN-1', role: 'teammate' });
  assert.notEqual(rebuilt.historyEntryId, first.historyEntryId);
  assert.equal(rebuilt.unpostedCount, 0);
  assert.match(rebuilt.lastCommentUrl, /focusedCommentId=42/);

  const two = await call('postOpenQuestions', { issueKey: 'KAN-1', historyEntryId: rebuilt.historyEntryId });
  assert.equal(two.status, 'already-posted');
  const three = await call('postOpenQuestions', { issueKey: 'KAN-1', historyEntryId: first.historyEntryId });
  assert.equal(three.status, 'already-posted');
  assert.equal(posted.length, 1);
});

test('regression: a double click (two concurrent calls) makes exactly one Jira POST', async () => {
  reset();
  const brief = await call('generateBrief', { issueKey: 'KAN-2', role: 'teammate' });
  const results = await Promise.all([
    call('postOpenQuestions', { issueKey: 'KAN-2', historyEntryId: brief.historyEntryId }),
    call('postOpenQuestions', { issueKey: 'KAN-2', historyEntryId: brief.historyEntryId }),
  ]);
  assert.equal(posted.length, 1);
  assert.deepEqual(results.map((r) => r.status).sort(), ['in-progress', 'success']);
});

test('a brief with a genuinely new question posts only that question', async () => {
  reset();
  const first = await call('generateBrief', { issueKey: 'KAN-3', role: 'teammate' });
  await call('postOpenQuestions', { issueKey: 'KAN-3', historyEntryId: first.historyEntryId });
  const before = store.get('KAN-3');
  const entry = { ...before[0], id: 'manual', commentId: '', commentUrl: '', openQuestions: [...before[0].openQuestions, 'Who signs off the release?'] };
  store.set('KAN-3', [entry, ...before]);
  const out = await call('postOpenQuestions', { issueKey: 'KAN-3', historyEntryId: 'manual' });
  assert.equal(out.status, 'success');
  assert.equal(out.postedCount, 1);
  assert.equal(posted.length, 2);
  assert.match(JSON.stringify(posted[1].adf), /Who signs off the release/);
});

test('posts made before the ledger existed (marked only in history) still block a repeat', async () => {
  reset();
  const brief = await call('generateBrief', { issueKey: 'KAN-4', role: 'teammate' });
  const history = store.get('KAN-4');
  history[0] = { ...history[0], commentId: '10000', commentUrl: 'https://ayra-dev.atlassian.net/browse/KAN-4?focusedCommentId=10000' };
  store.set('KAN-4', history);
  const rebuilt = await call('generateBrief', { issueKey: 'KAN-4', role: 'teammate' });
  assert.equal(rebuilt.unpostedCount, 0);
  const out = await call('postOpenQuestions', { issueKey: 'KAN-4', historyEntryId: brief.historyEntryId });
  assert.equal(out.status, 'already-posted');
  assert.equal(posted.length, 0);
});
