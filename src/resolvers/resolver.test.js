// Resolver flow with Jira, Confluence, and Forge KVS mocked. Run via `npm test`
// (needs --experimental-test-module-mocks, set in package.json).
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const store = new Map();
const posted = [];

mock.module('../lib/store.js', {
  namedExports: {
    loadHistory: async (key) => store.get(key) || [],
    saveHistory: async (key, value) => {
      store.set(key, value);
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
        comments: [],
        links: [],
        labels: ['customer'],
      },
    }),
    searchConfluencePages: async (query) => ({ ok: true, query, spaceKey: null, pages: [] }),
    postIssueComment: async (key, adf) => {
      posted.push({ key, adf });
      return { ok: true, commentId: '42', commentUrl: `https://ayra-dev.atlassian.net/browse/${key}?focusedCommentId=42` };
    },
  },
});

const { handler } = await import('./index.js');

function call(functionKey, payload) {
  return handler({ call: { functionKey, payload }, context: { extension: { issue: { key: 'KAN-7' } } } });
}

test('generateBrief saves history, dedupes rebuilds, and posts open questions once', async () => {
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
