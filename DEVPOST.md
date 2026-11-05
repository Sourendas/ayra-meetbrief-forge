# MeetBrief — Devpost draft

Text only. Do not submit this file to Devpost from the repo. Paste the sections you want into the Codegeist 2026 form.

## Project name

MeetBrief

## Tagline

A one-page brief from the Jira issue and Confluence pages you already have open.

## Problem

Software teams open a work item a few minutes before a meeting and still walk in cold. The status, the last comments, the parent, the linked issues, and the Confluence page that actually explains the decision are in three different places. A generic agenda does not say what is verified in the workspace and what nobody has written down yet.

## Solution

MeetBrief is a Forge app on the Jira issue and on a Confluence page. It reads the work item (summary, status, description, latest comments, assignee, parent, links) and searches Confluence for related pages, then shows five sections:

- Snapshot
- Recent
- Discussion
- Open questions
- Sources

If Jira or Confluence declines the read, or nothing matches, the brief says so and keeps the seat template separate from workspace facts. It does not invent URLs or status.

The same flow is a Rovo agent. Three actions gather an issue by key, search Confluence, and assemble the one-pager. Failed calls return an explicit partial result so the agent can say the brief is a template.

## Tech

- Atlassian Forge, UI Kit, Node.js 22
- Jira issue panel and Confluence global page
- Jira REST (`read:jira-work`) and Confluence search (`search:confluence`, content summary)
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

1. Clone `https://github.com/Sourendas/ayra-meetbrief-forge`.
2. `npm install`.
3. Install the Forge CLI and `forge login` with a Forge-scoped API token.
4. The app id in `manifest.yml` is already registered. Do not run `forge register` on this copy.
5. `forge deploy`, then install on a cloud site for both Jira and Confluence (`forge install`), or use `forge install --demo-site`.
6. Judges can also install from the app’s Distribution sharing link in the [developer console](https://developer.atlassian.com/console/myapps/) (Distribution → Sharing → copy the link). Install both products.
7. Jira: open a work item and use the MeetBrief panel.
8. Confluence: Apps → MeetBrief (route `meetbrief`).
9. Rovo: Agents → MeetBrief, and ask for a real issue key, for example `Brief me on ABC-123`.

A development install already exists on `https://ayra-dev.atlassian.net` for the author’s demo. That site is not a public judge login.

There is no cost to run the brief. No API keys are required for the Forge path.

## License

MIT
