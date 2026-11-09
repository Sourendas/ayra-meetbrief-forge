# MeetBrief — Devpost draft

Text only. Do not submit this file to Devpost from the repo. Paste the sections you want into the Codegeist 2026 form.

## Project name

MeetBrief

## Tagline

A one-page brief from the Jira issue and Confluence pages you already have open.

## Who it is for

The engineer, tech lead, or engineering manager who owns a Jira work item and has a standup, sprint review, incident follow-up, or stakeholder sync about it in the next few minutes. It runs right before the meeting, on the work item they already have open, and again at the next meeting on the same item.

## Problem

Software teams open a work item a few minutes before a meeting and still walk in cold. The status, the last comments, the parent, the linked issues, and the Confluence page that actually explains the decision are in three different places. A generic agenda does not say what is verified in the workspace and what nobody has written down yet.

## Solution

MeetBrief is a Forge app on the Jira issue and on a Confluence page. It reads the work item (summary, status, description, latest comments, assignee, parent, links) and searches Confluence for related pages, then shows five sections:

- Snapshot
- Recent
- Discussion
- Open questions
- Sources

The discussion points are not only a seat template. They come from the work item: a blocked item asks who can clear the blocker and by when, a bug asks who reproduces it and who verifies the fix, a story checks for acceptance criteria, an epic asks which children can be cut, and labels such as `security`, `customer`, `regression`, `release`, or `tech-debt` add their own prompt.

Two Forge features carry the brief past the meeting:

- **Post open questions to KEY.** One click adds the brief's open questions to the work item as a Jira comment, posted as the user (`write:jira-work`). A question already posted to that work item is never posted again, and the history links to the comment.
- **Brief history.** The last five briefs on each work item are kept in Forge KVS (`storage:app`). At the next meeting, **Since the last brief** shows the status move ("To Do → In Progress since the brief on 2 Nov") and which questions were added or no longer apply. Only a summary is stored, never comment text or page excerpts.

If Jira or Confluence declines the read, or nothing matches, the brief says so and keeps the seat template separate from workspace facts. It does not invent URLs or status.

The same flow is a Rovo agent. Three actions gather an issue by key, search Confluence, and assemble the one-pager. Failed calls return an explicit partial result so the agent can say the brief is a template.

## Impact: one before/after

`KAN-7 Checkout times out` is a bug: *In Progress*, *High* priority, labelled `customer`, nobody assigned.

- **Before:** the lead skims the comments, hunts for the runbook, and opens with "where are we on this?". The meeting turns into a recap. The owner and the repro steps stay in someone's notes.
- **After:** the panel already shows status, priority, the latest comments, and the matching page. The discussion points come from the issue ("agree who reproduces it and who verifies the fix", "agree what the customer hears next and who tells them"), and so do the open questions ("Who owns this work item?", "Are the steps to reproduce KAN-7 written down?"). One click puts those questions on KAN-7. At the next sync the history shows what moved.

The decision it improves: whether the meeting spends its time on the open decision (owner, date, scope, blocker) or on reading status aloud. MeetBrief does not claim a time-saved number. What it changes is where the open questions end up: on the work item.

## Tech

- Atlassian Forge, UI Kit, Node.js 22
- Jira issue panel and Confluence global page
- Jira REST reads (`read:jira-work`) and Confluence search (`search:confluence`, content summary)
- Jira write-back: one comment per brief, as the user, only on click (`write:jira-work`)
- Forge KVS (`@forge/kvs`, `storage:app`): brief history per work item, deduped, last five kept
- Rovo agent and Forge actions
- A small template assembler in the app. No external model, no paid search API, no secrets in the repository

The earlier web prototype used Tavily. This submission does not. It uses the team’s own Jira and Confluence data.

## Category

Software Teams

## Bonuses claimed

- Rovo agent. The manifest ships `rovo:agent` plus `gather-issue-context`, `gather-page-context`, and `assemble-brief`.

## Bonuses not claimed

- Teamwork Graph. The graph scopes are commented out in `manifest.yml`. They require a restricted allowlist, and this build does not call the graph API.

## Installation for judges

**Quick path:** open the Distribution Sharing install link in the submission, choose your own Atlassian Cloud site, install for Jira (and Confluence), approve the scopes, then open any work item and the **MeetBrief** panel. Build once, change the seat or the status, and rebuild to see **Brief history**. Click **Post open questions to KEY** to see the write-back.

**From source:**

1. Clone `https://github.com/Sourendas/ayra-meetbrief-forge`.
2. `npm install`.
3. Install the Forge CLI and `forge login` with a Forge-scoped API token.
4. The app id in `manifest.yml` belongs to the author's registered app.
5. On a fork, run `forge register` first (this app id belongs to the author). Then `forge deploy`, then install on a cloud site for both Jira and Confluence (`forge install`), or use `forge install --demo-site`.
7. Jira: open a work item and use the MeetBrief panel.
8. Confluence: Apps → MeetBrief (route `meetbrief`).
9. Rovo: Agents → MeetBrief, and ask for a real issue key, for example `Brief me on ABC-123`.

A development install already exists on `https://ayra-dev.atlassian.net` for the author’s demo. That site is not a public judge login.

There is no cost to run the brief. No API keys are required for the Forge path.

## License

MIT
