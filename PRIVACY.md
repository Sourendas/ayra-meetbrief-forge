# MeetBrief Privacy Policy

_Last updated: 9 November 2026_

MeetBrief is an open-source Atlassian Forge app (MIT License) maintained by Souren Das / Ayra Studio. This policy explains what data the app touches and how.

## What data the app accesses

When you use MeetBrief (Jira issue panel, Confluence page, or Rovo agent), it reads, through Atlassian Forge APIs and only with the permissions of the signed-in user:

- **Jira issues** – e.g. key, summary, status, assignee, dates, description and comments of the issue you open or name.
- **Confluence search results** – titles, excerpts and links of pages matching your query.

It only reads content the user can already access. It uses this data to build a pre-meeting brief shown back to that user.

## What the app stores

- **Brief history.** For each Jira work item, MeetBrief keeps a short summary of the last five briefs in Forge storage (Atlassian's key-value store for the app, on your site's Forge installation). The summary holds the time, the chosen seat, the meeting label and objective typed by the user, the issue status, the open-question lines, and the number of sources. Comment text, descriptions, and Confluence excerpts are not stored. Uninstalling the app removes this storage under Atlassian's Forge data retention rules.

## What the app writes

- **Jira comments, only on request.** When a user clicks **Post open questions**, MeetBrief adds one comment with that brief's open questions to the work item, as that user. It writes nothing else to Jira or Confluence.

## Where data is processed

- All processing runs on Atlassian's Forge platform, within your Atlassian Cloud site.
- The app does not send your data to any external server, third-party service or paid API.
- Apart from the brief history summary above, the app does not keep a copy of your Jira or Confluence content.

## What we do not do

- We do not sell, rent or share your data.
- The app includes no third-party analytics, advertising or tracking.
- The maintainer has no access to your Atlassian site content through this app.

Atlassian's own handling of data on its platform is covered by the [Atlassian Privacy Policy](https://www.atlassian.com/legal/privacy-policy).

## Open source

MeetBrief's source code is public under the MIT License (see [LICENSE](LICENSE)), so you can review exactly what it does.

## Contact

Questions or requests: **souren.devapp@gmail.com**

## Changes

Updates to this policy will be committed to this file in the repository.
