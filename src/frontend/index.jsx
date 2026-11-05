import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Text,
  Heading,
  Stack,
  Box,
  Button,
  Textfield,
  Select,
  TextArea,
  SectionMessage,
  Strong,
  Spinner,
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
  { label: 'Company / topic', value: 'company' },
  { label: 'Person', value: 'person' },
];

const App = () => {
  const [subject, setSubject] = useState('');
  const [kind, setKind] = useState('company');
  const [role, setRole] = useState('teammate');
  const [meetingLabel, setMeetingLabel] = useState('');
  const [objective, setObjective] = useState('');
  const [issueKey, setIssueKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);
  const [contextHint, setContextHint] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = await view.getContext();
        const extension = ctx?.extension || {};
        // jira:issuePanel provides issue.key when opened from an issue.
        const key = extension.issue?.key;
        if (key && !cancelled) {
          setIssueKey(key);
          setSubject((prev) => prev || key);
          setContextHint(`Anchored to ${key}`);
        }
      } catch (e) {
        // Confluence global page has no issue context — that is fine.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onGenerate = async () => {
    setLoading(true);
    setError(null);
    setBrief(null);
    try {
      let issueContext = null;
      if (issueKey.trim()) {
        // Prefer resolver-local assemble; issue fetch goes through Rovo action path later.
        // For the panel MVP we pass the key into the brief as light context.
        issueContext = {
          key: issueKey.trim(),
          summary: subject.trim() || issueKey.trim(),
          status: '',
          descriptionExcerpt: '',
          comments: [],
          url: '',
        };
      }

      const result = await invoke('generateBrief', {
        subject: subject.trim() || issueKey.trim(),
        kind,
        role,
        meetingLabel,
        objective,
        issueContext,
        pageContext: null,
      });

      if (result?.status === 'error') {
        setError(result.error || 'Could not generate brief');
      } else {
        setBrief(result.brief);
      }
    } catch (e) {
      setError(e?.message || 'Invoke failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box padding="space.200">
      <Stack space="space.200">
        <Heading size="large">MeetBrief</Heading>
        <Text>
          Pre-meeting one-pager from Jira / Confluence context. Template engine — no paid APIs.
          Use the <Strong>MeetBrief</Strong> Rovo agent for richer gather actions.
        </Text>
        {contextHint ? (
          <SectionMessage appearance="information">{contextHint}</SectionMessage>
        ) : null}

        <Textfield
          label="Subject"
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Company, person, or topic"
        />
        <Select
          label="Kind"
          name="kind"
          options={KIND_OPTIONS}
          value={KIND_OPTIONS.find((o) => o.value === kind)}
          onChange={(opt) => setKind(opt.value)}
        />
        <Select
          label="Your seat"
          name="role"
          options={ROLE_OPTIONS}
          value={ROLE_OPTIONS.find((o) => o.value === role)}
          onChange={(opt) => setRole(opt.value)}
        />
        <Textfield
          label="Meeting"
          name="meeting"
          value={meetingLabel}
          onChange={(e) => setMeetingLabel(e.target.value)}
          placeholder="e.g. Thu 11:00 IST stakeholder sync"
        />
        <Textfield
          label="Jira issue key (optional)"
          name="issueKey"
          value={issueKey}
          onChange={(e) => setIssueKey(e.target.value)}
          placeholder="PROJ-123"
        />
        <TextArea
          label="Objective (optional)"
          name="objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="What do you need from this meeting?"
        />

        <Button appearance="primary" onClick={onGenerate} isDisabled={loading}>
          {loading ? 'Generating…' : 'Generate brief'}
        </Button>

        {loading ? <Spinner size="medium" /> : null}
        {error ? <SectionMessage appearance="error">{error}</SectionMessage> : null}

        {brief ? (
          <Stack space="space.150">
            <Heading size="medium">Your brief</Heading>
            <SectionMessage appearance="success">
              Engine: {brief.engine} · Generated {brief.generatedAt}
            </SectionMessage>
            <Heading size="small">Snapshot</Heading>
            {brief.snapshot.map((line) => (
              <Text key={line}>• {line}</Text>
            ))}
            <Heading size="small">Discussion points</Heading>
            {brief.discussionPoints.map((line) => (
              <Text key={line}>• {line}</Text>
            ))}
            <Heading size="small">Open questions</Heading>
            {brief.openQuestions.map((line) => (
              <Text key={line}>• {line}</Text>
            ))}
            <Heading size="small">Gaps / unverified</Heading>
            {brief.unverified.map((line) => (
              <Text key={line}>• {line}</Text>
            ))}
            <Heading size="small">Markdown</Heading>
            <TextArea isReadOnly value={brief.markdown} />
          </Stack>
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
