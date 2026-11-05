/**
 * Template briefing assembler (no paid LLM / Tavily required).
 * Ports MeetBrief UX ideas: snapshot → context → discussion → questions → sources,
 * with explicit unverified / gap callouts.
 */

const ROLE_PROMPTS = {
  supplier: [
    'Confirm delivery windows and SLAs against current priorities.',
    'Ask what blockers would slip the next milestone.',
    'Offer one concrete next step you can own this week.',
  ],
  investor: [
    'Lead with traction metrics tied to open work items.',
    'Be ready on runway risks visible in the backlog.',
    'Ask what evidence would unlock the next conversation.',
  ],
  partner: [
    'Map shared goals to named Jira epics or Confluence plans.',
    'Surface dependency owners and decision deadlines.',
    'Propose a joint milestone with a single DRI.',
  ],
  influencer: [
    'Anchor the ask to a specific launch or story.',
    'Bring proof points (links) you can cite live.',
    'Agree on creative constraints and review turnaround.',
  ],
  teammate: [
    'Align on the decision you need from this meeting.',
    'Call out risks already tracked in Jira.',
    'Leave with owners and dates, not just notes.',
  ],
};

function uniqueSources(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item) continue;
    const key = item.url || item.title || JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function assembleBriefFromInputs({
  subject,
  kind = 'company',
  role = 'teammate',
  meetingLabel = '',
  objective = '',
  issueContext = null,
  pageContext = null,
}) {
  const normalizedRole = ROLE_PROMPTS[role] ? role : 'teammate';
  const discussion = [...ROLE_PROMPTS[normalizedRole]];
  const openQuestions = [];
  const sources = [];
  const recent = [];
  const unverified = [];

  if (issueContext && issueContext.key) {
    recent.push({
      type: 'jira',
      title: `${issueContext.key}: ${issueContext.summary || 'Untitled'}`,
      detail: issueContext.status
        ? `Status: ${issueContext.status}`
        : 'Status unknown',
      verified: true,
    });
    if (issueContext.url) {
      sources.push({ title: issueContext.key, url: issueContext.url });
    }
    if (issueContext.descriptionExcerpt) {
      recent.push({
        type: 'jira',
        title: 'Issue description excerpt',
        detail: issueContext.descriptionExcerpt,
        verified: true,
      });
    }
    if (Array.isArray(issueContext.comments) && issueContext.comments.length) {
      recent.push({
        type: 'jira',
        title: 'Recent comments',
        detail: issueContext.comments.slice(0, 3).join(' · '),
        verified: true,
      });
    } else {
      openQuestions.push('Any updates in comments that are not on the issue yet?');
    }
  } else {
    unverified.push('No Jira issue context attached — brief is template-only for that lane.');
    openQuestions.push('Which Jira issue should anchor this meeting?');
  }

  if (pageContext && Array.isArray(pageContext.pages) && pageContext.pages.length) {
    for (const page of pageContext.pages.slice(0, 5)) {
      recent.push({
        type: 'confluence',
        title: page.title || 'Untitled page',
        detail: page.excerpt || 'No excerpt',
        verified: Boolean(page.id || page.url),
      });
      if (page.url || page.title) {
        sources.push({ title: page.title || 'Confluence', url: page.url || '' });
      }
    }
  } else {
    unverified.push('No Confluence pages attached — add a space search before the meeting.');
    openQuestions.push('Is there a Confluence page or space that holds the agenda?');
  }

  if (objective) {
    discussion.unshift(`Stay focused on the objective: ${objective}`);
  } else {
    openQuestions.push('What is the single outcome you want from this meeting?');
  }

  const snapshotParts = [
    `${kind === 'person' ? 'Person' : 'Subject'}: ${subject}`,
    meetingLabel ? `Meeting: ${meetingLabel}` : null,
    `Seat: ${normalizedRole}`,
    objective ? `Objective: ${objective}` : null,
  ].filter(Boolean);

  const markdown = [
    `# MeetBrief — ${subject}`,
    '',
    '## Snapshot',
    ...snapshotParts.map((line) => `- ${line}`),
    '',
    '## Recent context',
    ...(recent.length
      ? recent.map((r) => `- **${r.title}** — ${r.detail}${r.verified ? '' : ' _(unverified)_'}`)
      : ['- _None yet_']),
    '',
    '## Discussion points',
    ...discussion.map((d) => `- ${d}`),
    '',
    '## Open questions',
    ...(openQuestions.length ? openQuestions.map((q) => `- ${q}`) : ['- _None_']),
    '',
    '## Unverified / gaps',
    ...(unverified.length ? unverified.map((u) => `- ${u}`) : ['- _None flagged_']),
    '',
    '## Sources',
    ...(sources.length
      ? uniqueSources(sources).map((s) => `- [${s.title}](${s.url || '#'})`)
      : ['- _Add Jira / Confluence links_']),
    '',
  ].join('\n');

  return {
    subject,
    kind,
    role: normalizedRole,
    meetingLabel,
    objective,
    snapshot: snapshotParts,
    recent,
    discussionPoints: discussion,
    openQuestions,
    unverified,
    sources: uniqueSources(sources),
    markdown,
    generatedAt: new Date().toISOString(),
    engine: 'template-v1',
  };
}
