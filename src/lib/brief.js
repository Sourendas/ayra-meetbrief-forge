/**
 * Template briefing assembler.
 * Turns Jira + Confluence facts into Snapshot / Recent / Discussion / Open questions / Sources.
 * Missing context stays explicit. Nothing here calls a paid model or invents URLs.
 */

import { clip, formatWhen, originOf } from './text.js';

const ROLE_PROMPTS = {
  supplier: [
    'Confirm delivery windows against the status on this work item.',
    'Ask which blocker would slip the next milestone.',
    'Offer one next step you can own before you leave the room.',
  ],
  investor: [
    'Lead with the outcome this work item is meant to prove.',
    'Be ready on risks already visible in the status and links.',
    'Ask what evidence would unlock the next conversation.',
  ],
  partner: [
    'Map the shared goal to this work item and any linked items.',
    'Name the dependency owner and the decision deadline.',
    'Propose one joint milestone with a single owner.',
  ],
  influencer: [
    'Anchor the ask to the story this work item is telling.',
    'Bring only proof points that appear in Sources.',
    'Agree on constraints and how fast a review can turn around.',
  ],
  teammate: [
    'Start from the decision this meeting has to make.',
    'Call out the risk already written on the work item.',
    'Leave with an owner and a date, not another status recap.',
  ],
};

const SEAT_LABEL = {
  supplier: 'Supplier',
  investor: 'Investor',
  partner: 'Partner',
  influencer: 'Influencer',
  teammate: 'Teammate',
};

function statusBucket(issue) {
  const category = String(issue?.statusCategory || '').toLowerCase();
  const name = String(issue?.status || '').toLowerCase();
  if (/block|on hold|waiting/.test(name)) return 'blocked';
  if (/review|qa|testing/.test(name)) return 'review';
  if (category === 'done' || /done|closed|resolved|complete|released/.test(name)) return 'done';
  if (category === 'indeterminate' || /progress|doing|develop/.test(name)) return 'active';
  if (category === 'new' || /to do|todo|open|backlog|new|selected/.test(name)) return 'todo';
  return '';
}

const LABEL_PROMPTS = [
  [/^(security|sec|vuln|cve)/, 'Labelled security: agree who signs off and keep exploit detail out of the meeting notes.'],
  [/regression/, 'Labelled regression: name the change that caused it and decide whether a rollback beats a fix.'],
  [/^(customer|support|escalation|cx)/, 'Customer-facing: agree what the customer hears next and who tells them.'],
  [/^(release|launch|go-?live|ship)/, 'Tied to a release: confirm the cut-off date and who makes the go/no-go call.'],
  [/(tech-?debt|debt|refactor)/, 'Tech debt: put a cost on leaving it so it can be ranked against feature work.'],
  [/(incident|outage|sev[0-9]?|p[01]$)/, 'Incident work: confirm the follow-up actions have owners and dates.'],
];

/**
 * Discussion prompts and open questions that come from the work item itself
 * (type, status, priority, labels), not from the seat template.
 * Each line names the field it came from, so the room can tell fact from template.
 */
export function issueAwarePrompts(issue) {
  const prompts = [];
  const questions = [];
  if (!issue?.key) return { prompts, questions };

  const status = issue.status || 'this status';
  const bucket = statusBucket(issue);
  if (bucket === 'blocked') {
    prompts.push(`${issue.key} is ${status}: name the blocker, who can clear it, and by when.`);
  } else if (bucket === 'review') {
    prompts.push(`${issue.key} is in ${status}: ask what is left before it can merge or ship.`);
  } else if (bucket === 'active') {
    prompts.push(`${issue.key} is ${status}: ask what is left and what would stop it landing this week.`);
  } else if (bucket === 'done') {
    prompts.push(`${issue.key} is already ${status}: use the time for follow-ups and lessons, not a status recap.`);
  } else if (bucket === 'todo') {
    prompts.push(`${issue.key} is still ${status}: decide whether it is committed now or goes back to the backlog.`);
  }

  const type = String(issue.issueType || '').toLowerCase();
  const description = String(issue.descriptionExcerpt || '');
  if (/bug|defect|incident/.test(type)) {
    prompts.push('It is a bug: agree who reproduces it and who verifies the fix before anyone debates a date.');
    if (description && !/(steps|repro|reproduce|expected|actual)/i.test(description)) {
      questions.push(`Are the steps to reproduce ${issue.key} written down anywhere?`);
    }
  } else if (/epic/.test(type)) {
    prompts.push('It is an epic: walk the child items still open and agree which ones can be cut.');
  } else if (/story|feature/.test(type)) {
    prompts.push('It is a story: check the acceptance criteria are written before calling it ready.');
    if (description && !/(acceptance|criteria|given|when|then|done when)/i.test(description)) {
      questions.push(`What are the acceptance criteria for ${issue.key}?`);
    }
  } else if (/sub-?task|task|chore/.test(type)) {
    prompts.push('It is a task: confirm the definition of done fits one owner’s week.');
  }

  const labels = (issue.labels || []).map((label) => String(label).toLowerCase());
  for (const [pattern, line] of LABEL_PROMPTS) {
    if (labels.some((label) => pattern.test(label)) && !prompts.includes(line)) prompts.push(line);
  }

  const priority = String(issue.priority || '');
  if (/highest|critical|blocker|urgent|^p0$|^p1$|^high$/i.test(priority)) {
    prompts.push(`Priority is ${priority}: agree what gets dropped to make room for it.`);
  }

  if (bucket === 'done' && Array.isArray(issue.links) && issue.links.some((link) => !/done|closed|resolved/i.test(link.status || ''))) {
    questions.push(`${issue.key} is done but linked work is still open. Who owns closing it out?`);
  }

  return { prompts: prompts.slice(0, 3), questions };
}

function uniqueSources(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item?.title) continue;
    const key = item.url || item.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: item.title, url: item.url || '' });
  }
  return out;
}

function linkedBrowse(issueUrl, key) {
  const origin = originOf(issueUrl);
  if (!origin || !key) return '';
  return `${origin}/browse/${key}`;
}

export function assembleBriefFromInputs({
  subject,
  kind = 'company',
  role = 'teammate',
  meetingLabel = '',
  objective = '',
  issueContext = null,
  pageContext = null,
  warnings = [],
  now = new Date(),
}) {
  const normalizedRole = ROLE_PROMPTS[role] ? role : 'teammate';
  const discussion = [...ROLE_PROMPTS[normalizedRole]];
  const openQuestions = [];
  const sources = [];
  const recent = [];
  const gaps = [];

  const issue = issueContext && issueContext.key ? issueContext : null;
  const pages = Array.isArray(pageContext?.pages) ? pageContext.pages : [];

  if (issue) {
    const bits = [
      issue.status || 'Status unknown',
      issue.issueType || '',
      issue.priority || '',
      issue.assignee ? `Assignee ${issue.assignee}` : 'Unassigned',
    ].filter(Boolean);
    recent.push({
      type: 'jira',
      title: `${issue.key}: ${issue.summary || 'Untitled'}`,
      detail: bits.join(' · '),
      url: issue.url || '',
      verified: true,
    });
    if (issue.url) sources.push({ title: `${issue.key} on Jira`, url: issue.url });

    if (issue.descriptionExcerpt) {
      recent.push({
        type: 'jira',
        title: 'Description',
        detail: issue.descriptionExcerpt,
        url: issue.url || '',
        verified: true,
      });
    } else {
      openQuestions.push('The description is empty. What should the room treat as the source of truth?');
    }

    const comments = Array.isArray(issue.comments) ? issue.comments : [];
    if (comments.length) {
      for (const comment of comments.slice(-2)) {
        const who = comment.author || 'Someone';
        recent.push({
          type: 'jira',
          title: `Comment · ${who}`,
          detail: comment.text || 'No text',
          url: comment.url || issue.url || '',
          verified: true,
        });
      }
    } else {
      openQuestions.push('Any update that is still only in someone’s head, not in the comments?');
    }

    if (issue.parent?.key) {
      const parentUrl = linkedBrowse(issue.url, issue.parent.key);
      recent.push({
        type: 'jira',
        title: `Parent ${issue.parent.key}`,
        detail: issue.parent.summary || 'Parent work item',
        url: parentUrl,
        verified: true,
      });
      if (parentUrl) sources.push({ title: `Parent ${issue.parent.key}`, url: parentUrl });
    }

    const links = Array.isArray(issue.links) ? issue.links.slice(0, 2) : [];
    for (const link of links) {
      const url = linkedBrowse(issue.url, link.key);
      recent.push({
        type: 'jira',
        title: link.key,
        detail: [link.relation, link.status, link.summary].filter(Boolean).join(' · '),
        url,
        verified: true,
      });
      if (url) sources.push({ title: link.key, url });
    }
    if (links.length) {
      discussion.push(
        `Walk the linked work before you debate scope: ${links.map((link) => link.key).join(', ')}.`
      );
    }

    const aware = issueAwarePrompts(issue);
    if (aware.prompts.length) {
      discussion.splice(1, 0, ...aware.prompts);
    } else {
      discussion.splice(
        1,
        0,
        `Confirm ${issue.key} is still ${issue.status || 'in this status'} before the room moves on.`
      );
    }
    openQuestions.push(...aware.questions);

    if (!issue.assignee) {
      openQuestions.push('Who owns this work item walking into the meeting?');
    }

    const updatedAt = Date.parse(issue.updated || '');
    if (!Number.isNaN(updatedAt)) {
      const ageDays = Math.floor((now.getTime() - updatedAt) / 86400000);
      if (ageDays >= 14) {
        openQuestions.push(
          `${issue.key} was last updated ${formatWhen(issue.updated)} (${ageDays} days ago). Is that status still true?`
        );
      }
    }
  } else {
    gaps.push('No Jira work item is attached. Status, comments, and links are not in this brief.');
    openQuestions.push('Which Jira issue should anchor this meeting?');
  }

  if (pages.length) {
    for (const page of pages.slice(0, 3)) {
      const space = page.spaceName || page.spaceKey;
      recent.push({
        type: 'confluence',
        title: page.title || 'Untitled page',
        detail: [space, page.excerpt || 'No excerpt returned'].filter(Boolean).join(' — '),
        url: page.url || '',
        verified: Boolean(page.id || page.url),
      });
      if (page.url) sources.push({ title: page.title || 'Confluence page', url: page.url });
    }
    const titles = pages
      .slice(0, 3)
      .map((page) => page.title)
      .filter(Boolean);
    if (titles.length) {
      discussion.push(`Skim these pages before you speak: ${titles.join('; ')}.`);
    }
  } else if (pageContext?.error) {
    gaps.push(pageContext.error);
    openQuestions.push('Which Confluence page should we open if search stays empty?');
  } else if (pageContext) {
    const lookedFor = pageContext.query ? ` for "${pageContext.query}"` : '';
    gaps.push(`Confluence search${lookedFor} returned no pages.`);
    openQuestions.push('Is the agenda in a Confluence page this search did not catch?');
  } else {
    gaps.push('Confluence was not searched.');
    openQuestions.push('Is there a Confluence page that holds the agenda?');
  }

  if (objective) {
    discussion.unshift(`Stay on the objective: ${objective}`);
  } else {
    openQuestions.unshift('What is the single outcome you want from this meeting?');
  }

  for (const warning of warnings) {
    if (warning && !gaps.includes(warning)) gaps.push(warning);
  }

  const snapshot = [
    `${kind === 'person' ? 'Person' : 'Subject'}: ${subject}`,
    meetingLabel ? `Meeting: ${meetingLabel}` : 'Meeting: not set',
    `Seat: ${SEAT_LABEL[normalizedRole]}`,
    objective ? `Objective: ${objective}` : 'Objective: not set',
  ];
  if (issue) {
    snapshot.push(`Work item: ${issue.key} — ${issue.summary || 'Untitled'}`);
    const meta = [issue.status, issue.issueType, issue.priority, issue.assignee || 'Unassigned']
      .filter(Boolean)
      .join(' · ');
    if (meta) snapshot.push(meta);
    if (issue.labels?.length) snapshot.push(`Labels: ${issue.labels.slice(0, 6).join(', ')}`);
    if (issue.updated) snapshot.push(`Updated: ${formatWhen(issue.updated)}`);
  }

  const trimmedDiscussion = discussion.slice(0, 8);
  const trimmedQuestions = [];
  for (const question of openQuestions) {
    if (!trimmedQuestions.includes(question)) trimmedQuestions.push(question);
    if (trimmedQuestions.length === 6) break;
  }

  const trimmedRecent = recent.slice(0, 8);
  const trimmedSources = uniqueSources(sources);
  const hasWorkspaceFacts = Boolean(issue || pages.length);

  const markdown = [
    `# MeetBrief — ${subject}`,
    '',
    '## Snapshot',
    ...snapshot.map((line) => `- ${line}`),
    '',
    '## Recent',
    ...(trimmedRecent.length
      ? trimmedRecent.map((item) => `- **${item.title}** — ${item.detail}`)
      : ['- Nothing from Jira or Confluence yet.']),
    '',
    '## Discussion',
    ...trimmedDiscussion.map((line) => `- ${line}`),
    '',
    '## Open questions',
    ...(trimmedQuestions.length ? trimmedQuestions.map((line) => `- ${line}`) : ['- None.']),
    '',
    '## Sources',
    ...(trimmedSources.length
      ? trimmedSources.map((item) => (item.url ? `- [${item.title}](${item.url})` : `- ${item.title}`))
      : ['- No workspace URLs were returned.']),
    '',
    '## Could not verify',
    ...(gaps.length ? gaps.map((line) => `- ${line}`) : ['- Nothing flagged.']),
    '',
  ].join('\n');

  return {
    subject,
    kind,
    role: normalizedRole,
    seatLabel: SEAT_LABEL[normalizedRole],
    meetingLabel,
    objective,
    snapshot,
    recent: trimmedRecent,
    discussionPoints: trimmedDiscussion,
    openQuestions: trimmedQuestions,
    sources: trimmedSources,
    gaps,
    issue: issue
      ? {
          key: issue.key,
          summary: issue.summary || '',
          status: issue.status || '',
          statusCategory: issue.statusCategory || '',
          labels: Array.isArray(issue.labels) ? issue.labels.slice(0, 8) : [],
          issueType: issue.issueType || '',
          priority: issue.priority || '',
          assignee: issue.assignee || '',
          url: issue.url || '',
        }
      : null,
    markdown,
    generatedAt: now.toISOString(),
    engine: hasWorkspaceFacts ? 'workspace-v1' : 'template-v1',
  };
}

export function agentIssueMessage(issue) {
  if (!issue?.key) return 'No Jira issue was loaded.';
  const comments = (issue.comments || [])
    .map((comment) => `${comment.author || 'Someone'}: ${clip(comment.text, 140)}`)
    .join(' | ');
  return [
    `Loaded ${issue.key}: ${issue.summary || 'Untitled'}.`,
    `Status ${issue.status || 'unknown'}.`,
    issue.assignee ? `Assignee ${issue.assignee}.` : 'Unassigned.',
    issue.descriptionExcerpt ? `Description: ${clip(issue.descriptionExcerpt, 280)}` : 'Description is empty.',
    comments ? `Latest comments: ${comments}` : 'No comments returned.',
    issue.url ? `URL: ${issue.url}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function agentPagesMessage(pageContext) {
  const pages = pageContext?.pages || [];
  if (!pages.length) {
    return `No Confluence pages for "${pageContext?.query || ''}". Say so. Do not invent titles or URLs.`;
  }
  const lines = pages
    .slice(0, 5)
    .map((page) => `${page.title}${page.url ? ` (${page.url})` : ''}`)
    .join('; ');
  return `Found ${pages.length} Confluence page(s) for "${pageContext.query}": ${lines}`;
}
