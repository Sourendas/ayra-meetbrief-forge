import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleBriefFromInputs, issueAwarePrompts } from './brief.js';
import { mapIssue } from './atlassian.js';
import {
  HISTORY_LIMIT,
  markPending,
  postDecision,
  recordPost,
  changesSincePrevious,
  historyEntryFromBrief,
  historyKey,
  markPosted,
  mergeHistory,
  openQuestionsCommentAdf,
  sanitizeHistory,
} from './history.js';

const NOW = new Date('2026-11-09T12:00:00.000Z');

function issue(overrides = {}) {
  return {
    key: 'KAN-7',
    summary: 'Checkout times out',
    status: 'In Progress',
    statusCategory: 'indeterminate',
    issueType: 'Bug',
    priority: 'Medium',
    assignee: 'Priya Shah',
    updated: '2026-11-08T09:00:00.000Z',
    descriptionExcerpt: 'Users see a spinner after paying.',
    url: 'https://ayra-dev.atlassian.net/browse/KAN-7',
    comments: [{ author: 'Ari', text: 'Seen on mobile.', url: '' }],
    links: [],
    labels: [],
    ...overrides,
  };
}

function briefFor(issueContext, extra = {}) {
  return assembleBriefFromInputs({
    subject: issueContext.summary,
    role: 'teammate',
    now: NOW,
    issueContext,
    pageContext: { query: 'checkout', pages: [] },
    ...extra,
  });
}

test('mapIssue keeps the status category for issue-aware prompts', () => {
  const mapped = mapIssue({
    key: 'KAN-7',
    self: 'https://ayra-dev.atlassian.net/rest/api/3/issue/1',
    fields: { summary: 'x', status: { name: 'Doing', statusCategory: { key: 'indeterminate' } } },
  });
  assert.equal(mapped.statusCategory, 'indeterminate');
});

test('issue-aware prompts follow status, type, priority, and labels', () => {
  const bug = issueAwarePrompts(issue({ priority: 'Highest', labels: ['regression'] }));
  assert.match(bug.prompts[0], /KAN-7 is In Progress/);
  assert.ok(bug.prompts.some((line) => /bug/.test(line)));
  assert.ok(bug.prompts.some((line) => /regression/.test(line)));
  assert.ok(issueAwarePrompts(issue({ priority: 'Highest' })).prompts.some((line) => /Highest/.test(line)));
  assert.equal(bug.prompts.length, 3);
  assert.ok(bug.questions.some((line) => /steps to reproduce/.test(line)));

  const story = issueAwarePrompts(
    issue({ issueType: 'Story', status: 'To Do', statusCategory: 'new', descriptionExcerpt: 'Add SSO.', labels: ['security'] })
  );
  assert.match(story.prompts[0], /still To Do/);
  assert.ok(story.prompts.some((line) => /acceptance criteria/.test(line)));
  assert.ok(story.prompts.some((line) => /security/.test(line)));
  assert.ok(story.questions.some((line) => /acceptance criteria for KAN-7/.test(line)));

  const done = issueAwarePrompts(
    issue({ status: 'Done', statusCategory: 'done', links: [{ key: 'KAN-8', status: 'To Do' }] })
  );
  assert.match(done.prompts[0], /already Done/);
  assert.ok(done.questions.some((line) => /linked work is still open/.test(line)));

  const blocked = issueAwarePrompts(issue({ status: 'Blocked', statusCategory: 'indeterminate' }));
  assert.match(blocked.prompts[0], /name the blocker/);

  assert.deepEqual(issueAwarePrompts(null), { prompts: [], questions: [] });
});

test('two different work items get different discussion points for the same seat', () => {
  const a = briefFor(issue());
  const b = briefFor(issue({ key: 'KAN-9', issueType: 'Epic', status: 'Done', statusCategory: 'done' }));
  assert.notDeepEqual(a.discussionPoints, b.discussionPoints);
  assert.ok(b.discussionPoints.some((line) => /epic/.test(line)));
  assert.ok(a.discussionPoints.length <= 8);
});

test('history keys are scoped to a valid issue key', () => {
  assert.equal(historyKey('kan-7'), 'brief-history:KAN-7');
  assert.equal(historyKey('../x'), '');
});

test('history entries keep a compact, content-light summary', () => {
  const entry = historyEntryFromBrief(briefFor(issue(), { objective: 'Pick a fix owner' }), { now: NOW, id: 'a' });
  assert.equal(entry.id, 'a');
  assert.equal(entry.status, 'In Progress');
  assert.equal(entry.objective, 'Pick a fix owner');
  assert.ok(entry.openQuestions.length > 0);
  assert.equal('recent' in entry, false);
  assert.equal('markdown' in entry, false);
});

test('mergeHistory dedupes identical rebuilds, keeps newest first, and caps length', () => {
  const brief = briefFor(issue());
  const first = historyEntryFromBrief(brief, { now: NOW, id: 'a' });
  const again = historyEntryFromBrief(brief, { now: new Date('2026-11-09T13:00:00.000Z'), id: 'b' });
  const posted = markPosted([first], 'a', { commentId: '99', commentUrl: 'https://x/browse/KAN-7?focusedCommentId=99', now: NOW });
  const merged = mergeHistory(posted, again);
  assert.equal(merged.deduped, true);
  assert.equal(merged.history.length, 1);
  assert.equal(merged.entry.id, 'a');
  assert.equal(merged.entry.generatedAt, '2026-11-09T13:00:00.000Z');
  assert.equal(merged.entry.commentId, '99');

  let list = [];
  for (let i = 0; i < HISTORY_LIMIT + 3; i += 1) {
    const entry = historyEntryFromBrief(briefFor(issue(), { objective: `goal ${i}` }), { now: NOW, id: `e${i}` });
    list = mergeHistory(list, entry).history;
  }
  assert.equal(list.length, HISTORY_LIMIT);
  assert.equal(list[0].id, `e${HISTORY_LIMIT + 2}`);
  assert.deepEqual(sanitizeHistory('nope'), []);
});

test('changesSincePrevious reports status moves and question churn from stored entries', () => {
  const before = historyEntryFromBrief(briefFor(issue({ status: 'To Do', statusCategory: 'new' })), {
    now: new Date('2026-11-02T10:00:00.000Z'),
    id: 'old',
  });
  const after = historyEntryFromBrief(briefFor(issue({ assignee: '' })), { now: NOW, id: 'new' });
  const lines = changesSincePrevious([after, { ...before, commentUrl: 'https://x/c' }]);
  assert.ok(lines.some((line) => line === 'Status moved To Do → In Progress since the brief on 2026-11-02.'));
  assert.ok(lines.some((line) => /new open question/.test(line)));
  assert.ok(lines.some((line) => /posted to Jira/.test(line)));
  assert.deepEqual(changesSincePrevious([after]), []);
});

test('open questions become an ADF comment, and an empty list posts nothing', () => {
  const entry = historyEntryFromBrief(briefFor(issue(), { meetingLabel: 'Thu standup', objective: 'Pick owner' }), {
    now: NOW,
    id: 'a',
  });
  const adf = openQuestionsCommentAdf(entry, 'KAN-7');
  assert.equal(adf.type, 'doc');
  assert.equal(adf.version, 1);
  const list = adf.content.find((node) => node.type === 'bulletList');
  assert.equal(list.content.length, entry.openQuestions.length);
  assert.equal(list.content[0].content[0].content[0].text, entry.openQuestions[0]);
  assert.match(adf.content[1].content[0].text, /Meeting: Thu standup/);
  assert.match(JSON.stringify(adf), /KAN-7/);
  assert.equal(openQuestionsCommentAdf({ ...entry, openQuestions: [] }, 'KAN-7'), null);
});

test('postDecision guards by entry, by question set, and while a post is pending', () => {
  const entry = historyEntryFromBrief(briefFor(issue()), { now: NOW, id: 'a' });
  const empty = { questions: [], posts: [], pending: null };
  assert.equal(postDecision(entry, empty, NOW).action, 'post');
  assert.equal(postDecision(entry, markPending(empty, 'a', NOW), NOW).status, 'in-progress');
  assert.equal(postDecision(entry, markPending(empty, 'a', NOW), new Date(NOW.getTime() + 120000)).action, 'post');
  const ledger = recordPost(empty, 'a', entry.openQuestions, { commentId: '1', commentUrl: 'u1', now: NOW });
  assert.equal(ledger.pending, null);
  assert.deepEqual(postDecision(entry, ledger, NOW), { action: 'skip', status: 'already-posted', commentUrl: 'u1' });
  const other = { ...entry, id: 'b', openQuestions: entry.openQuestions.slice(1) };
  assert.equal(postDecision(other, ledger, NOW).status, 'already-posted');
  const fresh = { ...entry, id: 'c', openQuestions: [...entry.openQuestions, 'Brand new?'] };
  assert.deepEqual(postDecision(fresh, ledger, NOW), { action: 'post', questions: ['Brand new?'] });
});

test('mapIssue drops MeetBrief’s own comments from meeting context', () => {
  const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
  const mapped = mapIssue({
    key: 'KAN-1',
    self: 'https://ayra-dev.atlassian.net/rest/api/3/issue/1',
    fields: {
      summary: 'x',
      comment: {
        comments: [
          { id: '10000', author: { displayName: 'Souren' }, body: doc('MeetBrief — open questions') },
          { id: '10002', author: { displayName: 'Ari' }, body: doc('Owner is Priya.') },
        ],
      },
    },
  });
  assert.equal(mapped.comments.length, 1);
  assert.equal(mapped.comments[0].text, 'Owner is Priya.');
});
