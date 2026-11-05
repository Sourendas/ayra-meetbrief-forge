# Demo recording

Screen recording only. No face camera. About two minutes. Use a work item that has a summary, a status, and at least one of: a description, a comment, or a linked issue. A Confluence page that shares words with that summary makes the Recent section obviously real.

Record on https://ayra-dev.atlassian.net after `forge deploy` of this branch. Speak with cursor highlights, or stay silent and rely on the UI. Do not show API tokens, the developer console’s credentials, or `.env` files. There are no secrets in this repo.

## Happy path

1. Start on a Jira board. Click one work item and wait until the issue view is still.
2. Scroll to the **MeetBrief** panel. It should already be building, then show **Snapshot** with that issue key, status, type, and assignee.
3. Pause on **Recent**. Point at a comment or the description, then at a **Confluence** lozenge if a page came back. Those lines are the workspace read.
4. Scroll **Discussion**, **Open questions**, and **Sources**. Open one source link in a new tab and show it is the same issue or a real page, then come back.
5. Set **Your seat** to **Investor**, type an objective such as `Decide who owns the date`, and click **Rebuild brief**. The snapshot objective and the first discussion line should change. The issue key should not.
6. Leave Jira. In Confluence, open **Apps → MeetBrief** (route `meetbrief`).
7. The page should explain that it is waiting for an issue key or a topic, with no fake status.
8. Paste the same issue key, click **Build brief**, and show the same five sections.
9. Open **Rovo → Agents → MeetBrief**. Send `Brief me on KEY` with that same key. When the tool steps appear, leave them visible long enough to read **Gather Jira issue context** and **Assemble meeting brief**. The reply should cite the issue key and a source, or say plainly that a read failed.

## If a read fails

Keep rolling. A warning titled **Could not verify** is a successful honest state. Say which system declined (Jira or Confluence) and show that Discussion still renders the seat template while Sources stays empty of invented links. Do not refresh repeatedly.

## Before you upload

- The five headings appear in order: Snapshot, Recent, Discussion, Open questions, Sources.
- The issue key on screen matches the issue you opened.
- No browser password manager, no token page, no terminal with `forge login`.
