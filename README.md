# MeetBrief (Ayra) — Forge

Pre-meeting briefing agent for **Atlassian Forge**, rebuilt from [ayra-meetbrief](https://github.com/Sourendas/ayra-meetbrief) for **[Codegeist 2026](https://codegeist2026.devpost.com/)**.

| Field | Value |
| --- | --- |
| Hackathon | Codegeist 2026 |
| Category | **Software Teams** |
| Products | Jira (required) + Confluence (optional) |
| Modules | `jira:issuePanel`, `confluence:globalPage`, `rovo:agent`, `action` |
| Bonus aims | **Best Agents** (`rovo:agent` + actions); **Teamwork Graph** scopes stubbed |
| Deadline | 22 Dec 2026, 12:00pm PST |
| Spend | **$0** — Forge free tier, template brief engine (no Tavily/Vercel required for core) |
| License | MIT |

## What it does

MeetBrief turns workspace context into a scannable one-pager before a meeting:

1. **Snapshot** — subject, seat (supplier / investor / partner / influencer / teammate), objective  
2. **Recent context** — Jira issue + Confluence pages when available  
3. **Discussion points** + **open questions** tuned to your seat  
4. **Unverified / gaps** — explicit callouts when context is missing  
5. **Sources** — links you can click in the room  

The Jira **issue panel** and Confluence **global page** use Forge **UI Kit** + a template assembler (same UX ideas as the original MeetBrief web app). The **MeetBrief Rovo agent** can call actions to gather issue/page context and assemble the brief in chat.

Original web MVP (Tavily research): https://ayra-meetbrief-souren1.vercel.app  

## Repo layout

```
manifest.yml          # modules, permissions, app id placeholder
package.json
src/
  frontend/index.jsx  # UI Kit brief form → summary
  resolvers/index.js  # generateBrief / ping
  actions.js          # Rovo actions (Jira + Confluence + assemble)
  lib/brief.js        # template brief engine
  index.js
```

## Prerequisites (Souren)

1. **Node.js** LTS 22.x or 24.x ([Forge getting started](https://developer.atlassian.com/platform/forge/getting-started/))  
2. **Forge CLI** (free): `npm install -g @forge/cli` then `forge --version`  
3. **Atlassian account** + **API token with Forge scopes** from https://id.atlassian.com/manage-profile/security/api-tokens → *Create API token with scopes* → app **Forge**  
4. **Dev site** (free options):  
   - Preferred: `forge site provision` / `forge install --demo-site` (90-day demo site with seeded data, includes Rovo)  
   - Or: classic cloud developer site via http://go.atlassian.com/cloud-dev  

## Register, deploy, share (judges)

```bash
git clone https://github.com/Sourendas/ayra-meetbrief-forge.git
cd ayra-meetbrief-forge
npm install

# Login (email + scoped API token). Do NOT use sudo.
forge login

# Replace placeholder app.id and link the app to your account
forge register

# Deploy to development environment
forge deploy

# Install on demo site (or pick your cloud site)
forge install --demo-site
# or: forge install

# Hot reload while iterating
forge tunnel
```

### Where to find the app after install

- **Jira** — open any work item → Apps (grid) → **MeetBrief** issue panel  
- **Confluence** — Apps / MeetBrief global page route `meetbrief`  
- **Rovo** — Chat → agent **MeetBrief** (conversation starters included)  

### Share with judges

1. Keep the GitHub repo public (this one).  
2. Provide a short Loom/demo: open issue panel → generate brief → show Rovo agent calling `gather-issue-context`.  
3. Optional Marketplace listing later for the Marketplace bonus (not required for MVP).  
4. Submission on Devpost: https://codegeist2026.devpost.com/  

## Zero-spend notes

- No paid Atlassian APIs for the template brief path.  
- No Vercel required for the Forge core.  
- External Tavily/Groq from the original MeetBrief are **out of scope** for the Forge MVP (can be added later only with allowlisted `permissions.external.fetch` and free-tier keys).  
- Teamwork Graph scopes are declared; live Graph calls may need app allowlisting — see stub notes in `src/actions.js`.

## Next steps for Souren (blockers for deploy)

1. Create Forge-scoped API token and run `forge login`.  
2. Run `forge register` in this repo (writes a real `app.id` into `manifest.yml`).  
3. `forge deploy` then `forge install --demo-site` (or install on your cloud-dev site).  
4. Confirm Rovo agent appears; exercise actions on a sample issue.  
5. Register / complete Codegeist 2026 Devpost entry if not already done.  
6. (Optional) Request Teamwork Graph allowlist for the new app id; wire `requestTeamworkGraph`.  

## Related

- Original MeetBrief: https://github.com/Sourendas/ayra-meetbrief  
- Forge docs: https://developer.atlassian.com/platform/forge/getting-started/  
- Rovo agent module: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/  
