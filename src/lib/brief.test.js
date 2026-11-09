import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleBriefFromInputs } from './brief.js';
import { mapIssue, mapSearchResults } from './atlassian.js';
import { browseUrlFromSelf } from './text.js';
import {
  adfToText,
  cqlPhrase,
  normalizeIssueKey,
  parseBriefContext,
  readIssueKeyFromPayload,
} from './text.js';

const NOW = new Date('2026-11-05T12:00:00.000Z');

test('adfToText reads document text and ignores structure noise', () => {
  const text = adfToText({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Ship the rollout' },
          { type: 'hardBreak' },
          { type: 'mention', attrs: { text: '@Priya' } },
        ],
      },
    ],
  });
  assert.match(text, /Ship the rollout/);
  assert.match(text, /@Priya/);
  assert.equal(text.includes('paragraph'), false);
});

test('issue keys and CQL phrases stay narrow', () => {
  assert.equal(normalizeIssueKey(' abc-12 '), 'ABC-12');
  assert.equal(normalizeIssueKey('../admin'), '');
  assert.equal(normalizeIssueKey('DROP TABLE'), '');
  assert.equal(cqlPhrase('rollout "plan" \\ now'), 'rollout plan now');
});

test('action payload accepts an explicit key or the Jira browse URL', () => {
  assert.equal(readIssueKeyFromPayload({ issueKey: 'dev-9' }), 'DEV-9');
  assert.equal(
    readIssueKeyFromPayload({
      context: { jira: { url: 'https://ayra-dev.atlassian.net/browse/ABC-3' } },
    }),
    'ABC-3'
  );
  assert.equal(readIssueKeyFromPayload({ context: { jira: { issueKey: 12 } } }), '');
});

test('context JSON keeps page context when both shapes are present', () => {
  const parsed = parseBriefContext(
    JSON.stringify({
      issueContext: { key: 'ABC-1', summary: 'Rollout' },
      pageContext: { query: 'rollout', pages: [{ title: 'Runbook', url: 'https://example.test/wiki' }] },
    })
  );
  assert.equal(parsed.issueContext.key, 'ABC-1');
  assert.equal(parsed.pageContext.pages[0].title, 'Runbook');
  assert.equal(parsed.attached, true);
  assert.throws(() => parseBriefContext('{'));
});

test('mapIssue turns ADF comments and links into brief facts', () => {
  const issue = mapIssue({
    key: 'ABC-12',
    self: 'https://ayra-dev.atlassian.net/rest/api/3/issue/10012',
    fields: {
      summary: 'Rollout checklist',
      status: { name: 'In Progress' },
      issuetype: { name: 'Story' },
      priority: { name: 'High' },
      assignee: { displayName: 'Priya Shah' },
      updated: '2026-11-01T09:00:00.000Z',
      labels: ['meetbrief'],
      description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Need an owner.' }] }] },
      comment: {
        comments: [
          {
            id: '55',
            author: { displayName: 'Ari' },
            body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Blocked on legal.' }] }] },
          },
        ],
      },
      issuelinks: [
        {
          type: { outward: 'blocks' },
          outwardIssue: { key: 'ABC-2', fields: { summary: 'Legal review', status: { name: 'To Do' } } },
        },
      ],
      parent: { key: 'ABC-1', fields: { summary: 'Launch' } },
    },
  });
  assert.equal(issue.url, 'https://ayra-dev.atlassian.net/browse/ABC-12');
  assert.equal(issue.comments[0].text, 'Blocked on legal.');
  assert.match(issue.comments[0].url, /focusedCommentId=55/);
  assert.equal(issue.links[0].key, 'ABC-2');
  assert.equal(issue.parent.key, 'ABC-1');
});

test('mapSearchResults builds absolute Confluence URLs and strips excerpt HTML', () => {
  const pages = mapSearchResults({
    _links: { base: 'https://ayra-dev.atlassian.net/wiki' },
    results: [
      {
        title: 'Rollout runbook',
        excerpt: 'Check the <em>owner</em> before Thursday.',
        url: '/spaces/ENG/pages/1/Rollout-runbook',
        content: { id: '1', type: 'page', title: 'Rollout runbook' },
        resultGlobalContainer: { title: 'Engineering' },
      },
    ],
  });
  assert.equal(pages[0].url, 'https://ayra-dev.atlassian.net/wiki/spaces/ENG/pages/1/Rollout-runbook');
  assert.equal(pages[0].excerpt, 'Check the owner before Thursday.');
  assert.equal(pages[0].spaceName, 'Engineering');
});

test('a loaded issue and pages produce the five scan sections', () => {
  const brief = assembleBriefFromInputs({
    subject: 'Rollout checklist',
    role: 'teammate',
    meetingLabel: 'Thu 11:00 sync',
    objective: 'Name the rollout owner',
    now: NOW,
    issueContext: {
      key: 'ABC-12',
      summary: 'Rollout checklist',
      status: 'In Progress',
      issueType: 'Story',
      priority: 'High',
      assignee: 'Priya Shah',
      updated: '2026-11-01T09:00:00.000Z',
      descriptionExcerpt: 'Need an owner.',
      url: 'https://ayra-dev.atlassian.net/browse/ABC-12',
      comments: [{ author: 'Ari', text: 'Blocked on legal.', url: 'https://ayra-dev.atlassian.net/browse/ABC-12?focusedCommentId=55' }],
      links: [{ key: 'ABC-2', summary: 'Legal review', relation: 'blocks', status: 'To Do' }],
      parent: { key: 'ABC-1', summary: 'Launch' },
      labels: ['meetbrief'],
    },
    pageContext: {
      query: 'rollout',
      pages: [
        {
          id: '1',
          title: 'Rollout runbook',
          spaceName: 'Engineering',
          excerpt: 'Check the owner.',
          url: 'https://ayra-dev.atlassian.net/wiki/spaces/ENG/pages/1/Rollout-runbook',
        },
      ],
    },
  });

  assert.equal(brief.engine, 'workspace-v1');
  assert.ok(brief.snapshot.some((line) => line.includes('Name the rollout owner')));
  assert.ok(brief.recent.some((item) => item.title === 'Rollout runbook' && item.type === 'confluence'));
  assert.ok(brief.discussionPoints.some((line) => line.includes('ABC-2')));
  assert.ok(brief.sources.some((item) => item.url.includes('/browse/ABC-12')));
  for (const heading of ['## Snapshot', '## Recent', '## Discussion', '## Open questions', '## Sources']) {
    assert.ok(brief.markdown.includes(heading), heading);
  }
  assert.equal(brief.markdown.indexOf('## Snapshot') < brief.markdown.indexOf('## Recent'), true);
  assert.equal(brief.markdown.indexOf('## Recent') < brief.markdown.indexOf('## Discussion'), true);
  assert.equal(brief.markdown.indexOf('## Discussion') < brief.markdown.indexOf('## Open questions'), true);
  assert.equal(brief.markdown.indexOf('## Open questions') < brief.markdown.indexOf('## Sources'), true);
});

test('missing workspace context stays honest', () => {
  const brief = assembleBriefFromInputs({
    subject: 'Vendor sync',
    role: 'supplier',
    now: NOW,
    warnings: ['Jira declined the read (403).'],
    pageContext: { query: 'vendor', pages: [], error: 'Confluence declined the read (403).' },
  });
  assert.equal(brief.engine, 'template-v1');
  assert.equal(brief.recent.length, 0);
  assert.ok(brief.openQuestions.some((line) => /outcome/i.test(line)));
  assert.equal(brief.gaps.some((line) => /objective/i.test(line)), false);
  assert.ok(brief.gaps.some((line) => line.includes('No Jira')));
  assert.ok(brief.gaps.some((line) => line.includes('403')));
  assert.ok(brief.openQuestions.length > 0);
  assert.equal(brief.sources.length, 0);
});

test('browseUrlFromSelf prefers site base and never emits api.atlassian.com/browse', () => {
  assert.equal(
    browseUrlFromSelf(
      'https://api.atlassian.com/ex/jira/cloud-id/rest/api/3/issue/10000',
      'KAN-1',
      'https://ayra-dev.atlassian.net'
    ),
    'https://ayra-dev.atlassian.net/browse/KAN-1'
  );
  assert.equal(
    browseUrlFromSelf(
      'https://api.atlassian.com/ex/jira/cloud-id/rest/api/3/issue/10000',
      'KAN-1'
    ),
    ''
  );
  assert.equal(
    browseUrlFromSelf(
      'https://ayra-dev.atlassian.net/rest/api/3/issue/10000',
      'KAN-1'
    ),
    'https://ayra-dev.atlassian.net/browse/KAN-1'
  );
  assert.equal(
    browseUrlFromSelf(
      'https://api.atlassian.com/ex/jira/cloud-id/rest/api/3/issue/10000/comment/9',
      'KAN-1',
      'https://ayra-dev.atlassian.net/'
    ),
    'https://ayra-dev.atlassian.net/browse/KAN-1'
  );
});

test('mapIssue uses siteBase when self is the Forge API proxy host', () => {
  const issue = mapIssue(
    {
      key: 'KAN-1',
      self: 'https://api.atlassian.com/ex/jira/cloud-id/rest/api/3/issue/10000',
      fields: {
        summary: 'Stakeholder sync — Q4 roadmap',
        status: { name: 'In Progress' },
        issuetype: { name: 'Task' },
        priority: { name: 'Medium' },
        comment: { comments: [] },
        issuelinks: [],
        labels: [],
      },
    },
    'https://ayra-dev.atlassian.net'
  );
  assert.equal(issue.url, 'https://ayra-dev.atlassian.net/browse/KAN-1');
});
