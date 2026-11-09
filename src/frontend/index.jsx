import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  CodeBlock,
  Heading,
  Inline,
  Link,
  List,
  ListItem,
  Lozenge,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Strong,
  Text,
  TextArea,
  Textfield,
} from '@forge/react';
import { invoke, view } from '@forge/bridge';

const ROLE_OPTIONS = [
  { label: 'Teammate', value: 'teammate' },
  { label: 'Supplier', value: 'supplier' },
  { label: 'Investor', value: 'investor' },
  { label: 'Partner', value: 'partner' },
  { label: 'Influencer', value: 'influencer' },
];

const KIND_OPTIONS = [
  { label: 'Topic or team', value: 'company' },
  { label: 'Person', value: 'person' },
];

function optionValue(option, fallback) {
  if (!option) return fallback;
  if (typeof option === 'string') return option;
  return option.value || fallback;
}

function statusAppearance(status) {
  const value = String(status || '').toLowerCase();
  if (/done|closed|resolved|complete/.test(value)) return 'success';
  if (/progress|review/.test(value)) return 'inprogress';
  if (/block|cancel/.test(value)) return 'removed';
  if (/to do|todo|open|backlog|new/.test(value)) return 'new';
  return 'default';
}

function fieldValue(event) {
  return event?.target?.value ?? '';
}

const formatStamp = (iso) => {
  const value = String(iso || '');
  return value ? `${value.slice(0, 10)} ${value.slice(11, 16)} UTC` : '';
};

const HistoryView = ({ history, changes }) => {
  if (!history?.length) return null;
  return (
    <Stack space="space.100">
      <Heading size="small">Brief history on this work item</Heading>
      {changes?.length ? (
        <SectionMessage appearance="information" title="Since the last brief">
          <Stack space="space.050">
            {changes.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </Stack>
        </SectionMessage>
      ) : null}
      <List type="unordered">
        {history.map((entry, index) => (
          <ListItem key={entry.id}>
            <Inline space="space.100" alignBlock="center">
              <Text>{formatStamp(entry.generatedAt)}</Text>
              {index === 0 ? <Lozenge appearance="success">Latest</Lozenge> : null}
              <Lozenge appearance="new">{entry.seatLabel}</Lozenge>
              {entry.status ? (
                <Lozenge appearance={statusAppearance(entry.status)}>{entry.status}</Lozenge>
              ) : null}
              <Text>
                {entry.openQuestions?.length || 0} open question
                {(entry.openQuestions?.length || 0) === 1 ? '' : 's'}
                {entry.objective ? ` · ${entry.objective}` : ''}
              </Text>
              {entry.commentUrl ? (
                <Link href={entry.commentUrl} openNewTab>
                  Posted to Jira
                </Link>
              ) : null}
            </Inline>
          </ListItem>
        ))}
      </List>
    </Stack>
  );
};

const BriefView = ({ brief, writeBack }) => (
  <Stack space="space.200">
    <Inline space="space.100" alignBlock="center">
      <Heading size="small">Snapshot</Heading>
      {brief.issue?.status ? (
        <Lozenge appearance={statusAppearance(brief.issue.status)}>{brief.issue.status}</Lozenge>
      ) : (
        <Lozenge appearance="default">No work item</Lozenge>
      )}
      <Lozenge appearance="new">{brief.seatLabel}</Lozenge>
    </Inline>
    <Stack space="space.050">
      {brief.snapshot.map((line) => (
        <Text key={line}>{line}</Text>
      ))}
    </Stack>

    {brief.gaps?.length ? (
      <SectionMessage appearance="warning" title="Could not verify">
        <Stack space="space.050">
          {brief.gaps.map((gap) => (
            <Text key={gap}>{gap}</Text>
          ))}
        </Stack>
      </SectionMessage>
    ) : null}

    <Heading size="small">Recent</Heading>
    {brief.recent.length ? (
      <Stack space="space.150">
        {brief.recent.map((item, index) => (
          <Stack key={`${item.type}-${item.title}-${index}`} space="space.050">
            <Inline space="space.100" alignBlock="center">
              <Lozenge appearance={item.type === 'confluence' ? 'new' : 'inprogress'}>
                {item.type === 'confluence' ? 'Confluence' : 'Jira'}
              </Lozenge>
              {item.url ? (
                <Link href={item.url} openNewTab>
                  {item.title}
                </Link>
              ) : (
                <Strong>{item.title}</Strong>
              )}
            </Inline>
            <Text>{item.detail}</Text>
          </Stack>
        ))}
      </Stack>
    ) : (
      <Text>
        Nothing came back from Jira or Confluence. Discussion points below are the seat template
        until a work item or page is attached.
      </Text>
    )}

    <Heading size="small">Discussion</Heading>
    <List type="ordered">
      {brief.discussionPoints.map((line) => (
        <ListItem key={line}>{line}</ListItem>
      ))}
    </List>

    <Heading size="small">Open questions</Heading>
    {brief.openQuestions.length ? (
      <List type="unordered">
        {brief.openQuestions.map((line) => (
          <ListItem key={line}>{line}</ListItem>
        ))}
      </List>
    ) : (
      <Text>No open questions. Add an objective if you still need a decision from the room.</Text>
    )}
    {writeBack}

    <Heading size="small">Sources</Heading>
    {brief.sources.length ? (
      <Stack space="space.050">
        {brief.sources.map((source) =>
          source.url ? (
            <Link key={source.url} href={source.url} openNewTab>
              {source.title}
            </Link>
          ) : (
            <Text key={source.title}>{source.title}</Text>
          )
        )}
      </Stack>
    ) : (
      <Text>No workspace URLs yet. Lines above that are not tied to a link are a template, not a fact.</Text>
    )}

    <Heading size="small">Paste into notes</Heading>
    <CodeBlock language="markdown" text={brief.markdown} showLineNumbers={false} shouldWrapLongLines />
    <Text>
      {brief.engine === 'workspace-v1' ? 'Built from Jira and Confluence reads.' : 'Template only.'}{' '}
      {brief.generatedAt}
    </Text>
  </Stack>
);

const App = () => {
  const [surface, setSurface] = useState('loading');
  const [subject, setSubject] = useState('');
  const [kind, setKind] = useState('company');
  const [role, setRole] = useState('teammate');
  const [meetingLabel, setMeetingLabel] = useState('');
  const [objective, setObjective] = useState('');
  const [issueKey, setIssueKey] = useState('');
  const [confluenceQuery, setConfluenceQuery] = useState('');
  const [spaceKey, setSpaceKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);
  const [history, setHistory] = useState([]);
  const [changes, setChanges] = useState([]);
  const [historyEntryId, setHistoryEntryId] = useState('');
  const [historyWarning, setHistoryWarning] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState(null);
  const [postedUrl, setPostedUrl] = useState('');
  const [postDone, setPostDone] = useState(false);
  const [postNote, setPostNote] = useState('');
  const [siteUrl, setSiteUrl] = useState('');

  const build = async (overrides = {}, stillCurrent = () => true) => {
    const fields = {
      subject,
      kind,
      role,
      meetingLabel,
      objective,
      issueKey,
      confluenceQuery,
      spaceKey,
      ...overrides,
    };
    if (!stillCurrent()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke('generateBrief', {
        subject: fields.subject.trim(),
        kind: fields.kind,
        role: fields.role,
        meetingLabel: fields.meetingLabel.trim(),
        objective: fields.objective.trim(),
        issueKey: fields.issueKey.trim(),
        confluenceQuery: fields.confluenceQuery.trim(),
        spaceKey: fields.spaceKey.trim(),
        siteUrl: fields.siteUrl || siteUrl || '',
      });
      if (!stillCurrent()) return;
      if (result?.status === 'error') {
        setBrief(null);
        setError(result.error || 'Could not build a brief.');
      } else {
        setBrief(result.brief);
        setHistory(result.history || []);
        setChanges(result.changes || []);
        setHistoryEntryId(result.historyEntryId || '');
        setHistoryWarning(result.historyWarning || '');
        setPostError(null);
        const latest = (result.history || []).find((entry) => entry.id === result.historyEntryId);
        // Nothing new to post when every open question is already in a MeetBrief comment on this issue.
        const nothingNew = Boolean(latest?.commentUrl) || result.unpostedCount === 0;
        setPostDone(nothingNew && Boolean(result.brief?.openQuestions?.length));
        setPostedUrl(latest?.commentUrl || (nothingNew ? result.lastCommentUrl || '' : ''));
        setPostNote(nothingNew && !latest?.commentUrl ? 'These open questions are already in a MeetBrief comment on this work item.' : '');
        if (result.brief?.subject) {
          setSubject((current) =>
            current.trim().toUpperCase() === fields.issueKey.trim().toUpperCase()
              ? result.brief.subject
              : current
          );
        }
      }
    } catch (invokeError) {
      if (!stillCurrent()) return;
      setError(
        invokeError?.message ||
          'MeetBrief could not reach Jira or Confluence. If a permission prompt appeared, accept it and build again.'
      );
    } finally {
      if (stillCurrent()) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let key = '';
      try {
        const ctx = await view.getContext();
        key = ctx?.extension?.issue?.key || '';
        const host = ctx?.siteUrl || '';
        if (host) setSiteUrl(host);
      } catch {
        key = '';
      }
      if (cancelled) return;
      if (!key) {
        setSurface('confluence');
        return;
      }
      setSurface('jira');
      setIssueKey(key);
      setSubject(key);
      await build({ issueKey: key, subject: key }, () => !cancelled);
    })();
    return () => {
      cancelled = true;
    };
    // Mount once: the issue panel should open onto a brief for the current work item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const postOpenQuestions = async () => {
    if (!brief?.issue?.key || !historyEntryId || posting || postDone) return;
    setPosting(true);
    setPostError(null);
    try {
      const result = await invoke('postOpenQuestions', {
        issueKey: brief.issue.key,
        historyEntryId,
        siteUrl,
      });
      if (result?.status === 'success' || result?.status === 'already-posted') {
        setPostDone(true);
        setPostedUrl(result.commentUrl || '');
        setPostNote(result.status === 'already-posted' ? 'Already posted. No new comment was added.' : '');
        setHistory(result.history || history);
        setChanges(result.changes || changes);
      } else {
        setPostError(result?.error || 'Nothing was posted.');
      }
    } catch (invokeError) {
      setPostError(
        invokeError?.message ||
          'Jira did not accept the comment. If a permission prompt appeared, accept it and try again.'
      );
    } finally {
      setPosting(false);
    }
  };

  const canPost = Boolean(brief?.issue?.key && historyEntryId && brief?.openQuestions?.length);
  const writeBack = canPost ? (
    <Stack space="space.100">
      {postDone ? (
        <SectionMessage appearance="success" title={`Posted to ${brief.issue.key}`}>
          <Stack space="space.050">
            {postNote ? <Text>{postNote}</Text> : null}
            {postedUrl ? (
              <Link href={postedUrl} openNewTab>
                Open the comment
              </Link>
            ) : null}
          </Stack>
        </SectionMessage>
      ) : (
        <Inline space="space.100" alignBlock="center">
          <Button appearance="default" onClick={postOpenQuestions} isDisabled={posting || loading || postDone}>
            {posting ? 'Posting…' : `Post open questions to ${brief.issue.key}`}
          </Button>
          <Text>Adds one comment as you, so answers land on the work item.</Text>
        </Inline>
      )}
      {postError ? (
        <SectionMessage appearance="error" title="Not posted">
          {postError}
        </SectionMessage>
      ) : null}
    </Stack>
  ) : null;

  const canBuild = Boolean(subject.trim() || issueKey.trim() || confluenceQuery.trim());

  return (
    <Box padding="space.200">
      <Stack space="space.200">
        <Inline spread="space-between" alignBlock="center">
          <Heading size="medium">MeetBrief</Heading>
          <Lozenge appearance="inprogress">Pre-meeting</Lozenge>
        </Inline>
        <Text>
          One page before you walk in. Snapshot, recent Jira and Confluence context, discussion
          points, open questions, and the links those lines came from.
        </Text>

        {surface === 'jira' && issueKey ? (
          <SectionMessage appearance="information" title={issueKey}>
            Anchored to this work item. Change the seat or the objective, then rebuild.
          </SectionMessage>
        ) : null}

        {surface === 'confluence' && !brief && !loading ? (
          <SectionMessage appearance="discovery" title="Start from a work item or a topic">
            Enter an issue key such as ABC-123, or a Confluence topic. MeetBrief reads what this
            site allows and marks anything it could not verify.
          </SectionMessage>
        ) : null}

        <Select
          label="Your seat"
          name="role"
          options={ROLE_OPTIONS}
          value={ROLE_OPTIONS.find((option) => option.value === role)}
          onChange={(option) => setRole(optionValue(option, 'teammate'))}
        />
        <Select
          label="Subject is"
          name="kind"
          options={KIND_OPTIONS}
          value={KIND_OPTIONS.find((option) => option.value === kind)}
          onChange={(option) => setKind(optionValue(option, 'company'))}
        />
        <Textfield
          label="Subject"
          name="subject"
          value={subject}
          onChange={(event) => setSubject(fieldValue(event))}
          placeholder="Rollout, a customer, or a person"
        />
        <Textfield
          label="Meeting"
          name="meeting"
          value={meetingLabel}
          onChange={(event) => setMeetingLabel(fieldValue(event))}
          placeholder="Thu 11:00 stakeholder sync"
        />
        <Textfield
          label="Jira issue key"
          name="issueKey"
          value={issueKey}
          onChange={(event) => setIssueKey(fieldValue(event))}
          placeholder="ABC-123"
        />
        <Textfield
          label="Confluence search"
          name="confluenceQuery"
          value={confluenceQuery}
          onChange={(event) => setConfluenceQuery(fieldValue(event))}
          placeholder="Blank uses the issue summary"
        />
        <Textfield
          label="Space key (optional)"
          name="spaceKey"
          value={spaceKey}
          onChange={(event) => setSpaceKey(fieldValue(event))}
          placeholder="ENG"
        />
        <TextArea
          label="Objective"
          name="objective"
          value={objective}
          onChange={(event) => setObjective(fieldValue(event))}
          placeholder="The decision you want from the room"
        />

        <Button appearance="primary" onClick={() => build()} isDisabled={loading || !canBuild}>
          {loading ? 'Building…' : brief ? 'Rebuild brief' : 'Build brief'}
        </Button>
        {loading ? <Spinner size="medium" label="Building brief" /> : null}
        {error ? (
          <SectionMessage appearance="error" title="Brief not built">
            {error}
          </SectionMessage>
        ) : null}

        {brief ? <BriefView brief={brief} writeBack={writeBack} /> : null}
        {brief && historyWarning ? <Text>{historyWarning}</Text> : null}
        {brief ? <HistoryView history={history} changes={changes} /> : null}

        {!brief && !loading && surface !== 'loading' ? (
          <Text>
            The MeetBrief agent in Rovo can run the same brief from chat. Ask it for an issue key,
            for example “Brief me on ABC-123”.
          </Text>
        ) : null}
      </Stack>
    </Box>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
