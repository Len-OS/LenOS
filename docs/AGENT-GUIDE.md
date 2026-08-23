# Agent Guide — What Can You Ask Your Agents?

## Two kinds of agents

| Type | Where it runs | Needs |
|------|--------------|-------|
| Remote (LenGrowth managed) | LenGrowth cloud | Any browser |
| Local (Sprig / lenos-acp) | Your machine | LenOS desktop app |

## Talking to agents

Agents listen for `@mentions` in any channel they are members of.
Type `@lengrowth your question` in any channel.

---

## 10 things you can ask on **web** (remote agents)

Remote agents connect to LenGrowth's MCP tools: GA, GSC, HubSpot, Stripe, Shopify, PostHog, tasks, cron, and more.

1. `@lengrowth pull this week's Google Analytics report — top 5 pages by sessions, bounce rate, avg session duration`
2. `@lengrowth show me Search Console queries with impressions >500 and CTR <2% this month — flag quick wins`
3. `@lengrowth summarize the HubSpot pipeline: deals by stage, total ARR, which deals have been stale >14 days`
4. `@lengrowth check Stripe: MRR this month vs last, who churned, any failed payments outstanding`
5. `@lengrowth analyze Shopify orders last 30 days — AOV, top SKUs, refund rate — flag anomalies`
6. `@lengrowth run initial assessment for this workspace and generate my first task list`
7. `@lengrowth write a cold outreach email for a B2B SaaS founder who just hit 100 paying customers`
8. `@lengrowth what did our PostHog funnel look like last week — signup to activation, where do users drop off`
9. `@lengrowth create a cron workflow that posts a Monday morning growth summary every week at 8am`
10. `@lengrowth check my agent's readiness — are all credentials set, which MCP tools are unavailable`

---

## 10 things you can ask on **desktop** (local agents)

Local agents run on your machine via Sprig (lenos-acp + lenos-agent + lenos-dev-mcp). They can read files, run shell commands, and access your local dev environment.

1. `@agent fix the TypeScript error on line 42 of src/auth.ts and run the test suite`
2. `@agent write a commit message for my staged diff, push to a new branch, open a draft PR with screenshots`
3. `@agent grep the entire repo for TODO comments older than 3 months and list them by file`
4. `@agent run cargo test --package lenos-db and fix any failing tests without changing test logic`
5. `@agent sign this commit with my Nostr key and push to the relay-hosted git repo`
6. `@agent check all files in crates/ for unsafe blocks, unwrap() calls in production paths, and SQL string concatenation`
7. `@agent read my .env file and tell me which required vars from .env.example are missing`
8. `@agent take a screenshot of the unread state in the sidebar, then post it to PR #803`
9. `@agent run lenos-admin list-members on my local relay and tell me who has the Bot role`
10. `@agent read ARCHITECTURE.md, compare it with router.rs endpoints, and list any documented endpoints that no longer exist`

---

## Starting a local agent

Requires the LenOS desktop app. In the desktop app:

1. Open **Agents** in the sidebar
2. Click **+ Add agent**
3. Choose **Local** — this starts a Sprig subprocess on your machine
4. The agent joins your workspace channels and responds to `@mentions`

Local agents have shell and file access scoped to directories you allow in the agent configuration.

---

## Agent credentials

Remote agents need API credentials to access your tools (GA, HubSpot, etc.). Configure them in **Settings → Agent Credentials**. Credentials are NIP-44 encrypted before storage — the relay never sees them in plaintext.
