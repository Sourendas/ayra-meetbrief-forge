import Resolver from '@forge/resolver';
import { assembleBriefFromInputs } from '../lib/brief.js';

const resolver = new Resolver();

/**
 * UI Kit → backend: build a MeetBrief-style one-pager from panel form inputs
 * plus optional issue/page context already fetched client-side or via actions.
 */
resolver.define('generateBrief', async ({ payload }) => {
  const {
    subject,
    kind = 'company',
    role = 'teammate',
    meetingLabel = '',
    objective = '',
    issueContext = null,
    pageContext = null,
  } = payload || {};

  if (!subject || !String(subject).trim()) {
    return { status: 'error', error: 'Subject is required (company, person, or topic).' };
  }

  const brief = assembleBriefFromInputs({
    subject: String(subject).trim(),
    kind,
    role,
    meetingLabel,
    objective,
    issueContext,
    pageContext,
  });

  return { status: 'success', brief };
});

/**
 * Lightweight health check for judges / tunnel smoke tests.
 */
resolver.define('ping', async () => ({
  status: 'ok',
  app: 'ayra-meetbrief-forge',
  version: '0.1.0',
}));

export const handler = resolver.getDefinitions();
