# MeetBrief (Ayra) — Forge

A pre-meeting brief inside Jira and Confluence. Open a work item, and MeetBrief reads that issue plus related Confluence pages, then lays out one scannable page: **Snapshot**, **Recent**, **Discussion**, **Open questions**, and **Sources**. Anything it could not read is labeled as unverified. The same brief is available from the **MeetBrief** Rovo agent.

This is the Forge app for [Codegeist 2026](https://codegeist2026.devpost.com/). The earlier web MVP (Tavily, optional Groq) lives at [Sourendas/ayra-meetbrief](https://github.com/Sourendas/ayra-meetbrief) and [ayra-meetbrief-souren1.vercel.app](https://ayra-meetbrief-souren1.vercel.app). The Forge app does not depend on Vercel, Tavily, or any paid API.

| | |
| --- | --- |
| Hackathon | Codegeist 2026 |
| Category | **Software Teams** |
| Products | Jira (required) and Confluence (optional install) |
| Modules | Jira issue panel, Confluence global page (`meetbrief`), Rovo agent, three actions |
| Bonus claimed | **Rovo agent** (`rovo:agent` + `gather-issue-context`, `gather-page-context`, `assemble-brief`) |
| Forge depth | Forge KVS brief history per work item (`storage:app`) and Jira write-back of open questions (`write:jira-work`) |
| Bonus not claimed | **Teamwork Graph**. Those scopes are commented out in `manifest.yml` because they sit behind a restricted allowlist. |
| Spend | **$0**. Forge free tier. No model key, no PayPal, no secrets in the repo. |
| License | [MIT](LICENSE) |
| App id | `ari:cloud:ecosystem::app/fdcd4f89-f906-42ff-8922-f2748aec5ebe` (already registered — do not run `forge register` again) |
| Dev site | [ayra-dev.atlassian.net](https://ayra-dev.atlassian.net) (Jira + Confluence, development install) |

## Who it is for, and what changes

**Who:** the engineer, tech lead, or engineering manager who owns a Jira work item and has a standup, sprint review, incident follow-up, or stakeholder sync about it in the next few minutes.

**When:** right before the meeting, on the work item they already have open, and again at the next meeting on the same item.

**Decision it improves:** whether the room spends its time on the open decision (owner, date, scope, blocker) or on re-reading status out loud. MeetBrief puts the open questions first and turns them into a Jira comment, so the answers end up on the work item.

**Before / after, one concrete case.** A bug, `KAN-7 Checkout times out`, is *In Progress*, *High* priority, labelled `customer`, and unassigned.

- *Before:* the lead opens the issue, scrolls the comments, searches Confluence for the runbook, and walks in with "where are we on this?". The meeting ends with a recap, and the owner and repro steps stay in someone's notes.
- *After:* the MeetBrief panel already shows status, priority, the last comments, and the matching page. The discussion points come from the issue itself ("It is a bug: agree who reproduces it and who verifies the fix", "Customer-facing: agree what the customer hears next and who tells them") along with the open questions ("Who owns this work item?", "Are the steps to reproduce KAN-7 written down?"). One click posts those questions to KAN-7. At the next sync the panel's history says "Status moved To Do → In Progress since the brief on 2 Nov" and how many questions no longer apply.

MeetBrief does not measure time saved and does not claim a number. What it changes is where the open questions live: on the work item, in Jira, not in a private doc.

## For judges: install

1. Use the MeetBrief **Distribution Sharing** install link from the Devpost submission. It installs the **production** app.
2. Pick your own Atlassian Cloud site (a free [Cloud Developer site](https://developer.atlassian.com/platform/forge/getting-started/#create-an-atlassian-cloud-developer-site) works) and install for **Jira**. Install for **Confluence** too (open the link again if it asks for one product at a time). Confluence is optional and adds page search and the Confluence page.
3. Approve the scopes when Atlassian asks for them. MeetBrief reads Jira and Confluence as you, keeps its brief history in Forge storage, and writes to Jira only when you click **Post open questions**.
4. Open any Jira work item, then the **MeetBrief** panel. Rebuild once with a different seat, or after changing the status, to see **Brief history** and **Since the last brief**. Click **Post open questions to KEY** to add the comment.
5. Rovo: **Agents → MeetBrief**, `Brief me on KEY`.

The author's site `ayra-dev.atlassian.net` is private and is not a judge login. If the sharing link does not work for you, the source install below (`forge register` on a fork) reproduces the same app.

## What a brief contains

- **Snapshot** — subject, meeting, seat (teammate, supplier, investor, partner, influencer), objective, and the work item’s status, type, priority, and assignee when Jira returns them.
- **Recent** — description excerpt, latest comments, parent, linked work, and up to three Confluence pages.
- **Discussion** — prompts for the seat you picked, plus prompts built from the work item itself: its status (blocked, in review, in progress, done, to do), its type (bug, story, epic, task), its priority, and labels such as `security`, `regression`, `customer`, `release`, `tech-debt`, or `incident`. Linked work and matching Confluence pages are added when they come back.
- **Open questions** — decisions still missing (owner, empty description, stale update, no agenda page, missing repro steps on a bug, missing acceptance criteria on a story, done but linked work still open).
- **Post open questions to KEY** — one click adds the open questions to the work item as a Jira comment, posted as you. Each brief can be posted once, and the history links to the comment.
- **Brief history** — the last five briefs on that work item (seat, status, objective, question count) are kept in Forge KVS. **Since the last brief** lists status moves and questions that were added or no longer apply. Only that summary is stored. Comment text, descriptions, and page excerpts are not.
- **Sources** — browse and page URLs only. If a read fails, the panel says so and does not invent a link.

The issue panel builds this when it opens. The Confluence page waits until you enter an issue key or a topic. Rovo actions call the same Jira and Confluence reads. A failed read returns `partial` or `error` with a plain message.

## Install and share

Prerequisites: Node.js 22.x or 24.x, and the Forge CLI (`npm install -g @forge/cli`). Log in with an Atlassian API token that includes Forge scopes. Do not use `sudo`.

```bash
git clone https://github.com/Sourendas/ayra-meetbrief-forge.git
cd ayra-meetbrief-forge
npm install
forge login
```

The manifest already has the registered app id. `forge register` would create a second app. Deploy the code you have:

```bash
forge deploy
```

Install on a site you administer (repeat `--product confluence` so the global page and page search are available):

```bash
forge install --site ayra-dev.atlassian.net --product jira --environment development
forge install --site ayra-dev.atlassian.net --product confluence --environment development
```

Upgrade an existing install with `forge install --upgrade --site ayra-dev.atlassian.net --product jira --environment development` (and the same for Confluence).

A fresh 90-day site with sample data:

```bash
forge install --demo-site
```

### Creating the sharing link (maintainer)

1. Open the [developer console](https://developer.atlassian.com/console/myapps/).
2. Select **MeetBrief**.
3. Open **Distribution** → **Edit**.
4. Set distribution to **Sharing**, save, and copy the installation link.
5. Send that link. A judge opens it, chooses their own cloud site, and installs **Jira** and **Confluence**.

The development app is already installed on [https://ayra-dev.atlassian.net](https://ayra-dev.atlassian.net). That site is not public. Judges without access use the sharing link or `forge install --demo-site` from their own Forge login after you add them, or from a fork they register themselves. A fork must run `forge register` because this app id belongs to the existing app.

`npm test` runs the template, mapper, history, write-back, and resolver-flow checks (Jira, Confluence, and KVS are mocked). `forge lint` checks the manifest. No API token is required for the unit tests.

## Where to click

**Jira issue panel**

1. Open any work item on the site, for example from a software project board.
2. Find the **MeetBrief** panel on the issue (issue view → Apps, or the MeetBrief section on the issue).
3. The panel reads that issue and searches Confluence for the summary.
4. Change **Your seat** or **Objective**, then **Rebuild brief**.

**Confluence**

1. In Confluence, open **Apps → MeetBrief**.
2. The global page route is `meetbrief`. On a development install the path looks like `/wiki/apps/<app-id>/<environment-id>/meetbrief`. Production drops the environment id. The Apps menu is the reliable way in.
3. Enter an issue key such as the one you just opened, or a topic in **Confluence search**, then **Build brief**.

**Rovo**

1. Open **Rovo → Agents → MeetBrief** (Chat, then the agent).
2. Try a starter, or type: `Brief me on ABC-123` using a real key from the site.
3. The agent should call **Gather Jira issue context**, then **Gather Confluence page context**, then **Assemble meeting brief**.
4. If Jira or Confluence declines the read, the action returns a partial result and the reply should say the brief is a template. That is the expected honest path, not a crash.

Hot reload while iterating: `forge tunnel`.

## Walkthrough

Screenshots of the installed panel can replace this block. Until then, this is the issue-panel layout:

```
+------------------------------------------------------------------+
| MeetBrief                                         [ Pre-meeting ] |
| One page before you walk in.                                      |
|                                                                   |
| [i] ABC-123                                                       |
|     Anchored to this work item. Change the seat, then rebuild.    |
|                                                                   |
| Your seat        [ Teammate v ]                                   |
| Meeting          [ Thu 11:00 stakeholder sync          ]          |
| Jira issue key   [ ABC-123                              ]          |
| Objective        [ Name the rollout owner              ]          |
|                                         [ Rebuild brief ]         |
|                                                                   |
| SNAPSHOT                      [ In Progress ] [ Teammate ]        |
| Subject: Rollout checklist                                        |
| Work item: ABC-123 — Rollout checklist                            |
| In Progress · Story · High · Priya Shah                            |
|                                                                   |
| [!] Could not verify                                              |
|     (only if a read failed or the objective is empty)             |
|                                                                   |
| RECENT                                                            |
| [Jira] ABC-123: Rollout checklist                                 |
| [Jira] Description — Need an owner.                               |
| [Jira] Comment · Ari — Blocked on legal.                          |
| [Confluence] Rollout runbook — Engineering — Check the owner.     |
|                                                                   |
| DISCUSSION                                                        |
| 1. Stay on the objective: Name the rollout owner                  |
| 2. Start from the decision this meeting has to make.              |
| 3. ABC-123 is In Progress: ask what is left and what would stop  |
|    it landing this week.                                          |
| 4. It is a story: check the acceptance criteria are written.     |
|                                                                   |
| OPEN QUESTIONS                                                    |
| • Any update that is still only in someone’s head?                |
| [ Post open questions to ABC-123 ]                                |
|                                                                   |
| SOURCES                                                           |
| ABC-123 on Jira                                                   |
| Rollout runbook                                                   |
|                                                                   |
| PASTE INTO NOTES                                                  |
| (markdown of the same five sections)                              |
|                                                                   |
| BRIEF HISTORY ON THIS WORK ITEM                                   |
| [i] Since the last brief                                          |
|     Status moved To Do → In Progress since the brief on 2026-11-02|
| • 2026-11-09 06:30 UTC [Latest] [Teammate] [In Progress] 3 qs     |
| • 2026-11-02 10:00 UTC [Investor] [To Do] 4 qs  Posted to Jira    |
+------------------------------------------------------------------+
```

On the Confluence page, before the first build, the panel shows a discovery message: enter an issue key or a topic. An empty Jira or Confluence response leaves the five sections in place and explains the gap. It does not fill them with made-up status or URLs.

## Demo recording

The click-by-click script for a screen recording (no face camera) is in [TESTING.md](TESTING.md).

## Layout

```
manifest.yml             modules, scopes, registered app id
src/frontend/index.jsx   issue panel + Confluence page (UI Kit)
src/resolvers/index.js   generateBrief, getHistory, postOpenQuestions
src/actions.js           Rovo actions
src/lib/atlassian.js     REST reads, honest failures
src/lib/brief.js         Snapshot / Recent / Discussion / Open questions / Sources, issue-aware prompts
src/lib/history.js       brief history merge/dedupe, "since last brief", ADF comment body
src/lib/store.js         Forge KVS read/write for history
src/lib/text.js          ADF text, issue keys, CQL phrases
src/lib/*.test.js        node:test
src/resolvers/resolver.test.js  resolver flow with mocks
DEVPOST.md               submission draft (not submitted)
TESTING.md               recording script
```

Scopes in use: `read:jira-work`, `write:jira-work` (only for **Post open questions**), `storage:app` (brief history), `read:confluence-content.summary`, `read:confluence-content.permission`, `search:confluence`. Teamwork Graph scopes are comments only.

## License

MIT. Copyright (c) 2026 Souren Das. See [LICENSE](LICENSE).
