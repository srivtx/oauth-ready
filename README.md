# OAuth Ready

**Will this integration take an hour, or eight weeks of review?**

Before an AI agent can act for users inside another app, its developer needs a *provider OAuth app*, and sometimes the provider has to approve it. OAuth Ready gives you a shareable briefing per app: how hard it is, how long it takes (hands-on work vs. waiting on the provider), what can block you, what an agent can do for you, and where you take over. Every claim is tagged **tested**, **sourced**, or **inferred**.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsrivtx%2Foauth-ready&env=OPENCODE_API_KEY&envDescription=OpenCode%20Zen%20key%20for%20the%20default%20model&envLink=https%3A%2F%2Fopencode.ai%2Fzen)

## What's in it

| | |
|---|---|
| **Curated library** | GitHub, Notion, Slack, LinkedIn, Gmail: five apps chosen to span the difficulty range, hand-checked against primary docs plus live endpoint probes |
| **Live agent** | Type any app name or website. The agent reads the provider's real docs, probes its OAuth endpoints, writes a guide, then **checks every sourced claim against a verbatim quote from the page**. About 1 minute and 2–5¢, saved at a shareable URL. You watch it work in a Claude Code-style transcript (tool rows, live thinking, tokens and cost, Esc to interrupt) |
| **Search commands** | The home search box takes `/` commands (see below), with a typed-out tip when it's empty |
| **Ask** | Grounded chat on every guide page, and across the whole library from the home page. Every sentence cites fact ids (`[S4]`, `[L3]`), shown as chips coloured by evidence. Click one to see the fact and its verbatim quote. Questions the facts don't cover get a short answer marked *general knowledge*; off-topic questions are declined. About 0.1¢ an answer |
| **The wait chart** | Every guide's elapsed time to production on one log axis, from its phase timeline, with first-connection ticks |
| **Verification log** | `/evidence`: what we believed going in, what the sources actually said, and what we couldn't verify |

### Search commands

| Command | What it does |
|---|---|
| `/investigate <app or site>` | Default mode. Opens a library guide, or runs the live agent |
| `/ask <question>` | Ask mode. Name one app to use its guide, several (or none) to ask across the library. Follow-ups keep the conversation |
| `/compare <app> <app> [app]` | Verdict, difficulty, timelines, worst-case wait and Composio managed-app status side by side. No model call |
| `/play` | Opens the pocket console: pick an app, jump its approval gates, win to open its guide |
| `/random` | Opens a random curated guide |
| `/model` | Choose the model or bring your own key |

`↑ ↓` choose, `Tab`/`Enter` run, `Shift+Tab` cycles modes, `Backspace` on an empty box leaves a mode, `Tab` on an empty box takes the tip.

## Run it

Requires Node 20+.

```bash
npm install
cp .env.example .env.local    # add OPENCODE_API_KEY (default model) and/or GEMINI_API_KEY (free fallback)
npm run dev                   # http://localhost:3000
```

`npm run build && npm start` for a production build. `npm run lint` for lint.

### Environment

| Variable | Needed | Purpose |
|---|---|---|
| `OPENCODE_API_KEY` | yes (or Gemini) | Default model, DeepSeek V4.1 Flash via [OpenCode Zen](https://opencode.ai/zen) |
| `GEMINI_API_KEY` | optional | Free-tier fallback (small daily quota) |
| `BLOB_READ_WRITE_TOKEN` | in production | Persists agent-generated guides in Vercel Blob. Without it they go to `./data/generated` |
| `JINA_API_KEY` | optional | Higher rate limits for the page reader |
| `OPENCODE_MODELS_SMART`, `OPENCODE_MODELS_FAST` | optional | Comma-separated model fallback chains |
| `GENERATE_LIMIT_PER_HOUR` | optional | Fresh agent runs per IP on the shared key (default 8) |
| `ASK_LIMIT_PER_HOUR` | optional | Ask questions per IP on the shared key (default 40) |

### Deploy

1. Import the repo on Vercel (or use the button above) and set `OPENCODE_API_KEY`.
2. Add a Blob store (Storage → Blob → connect to the project) so `BLOB_READ_WRITE_TOKEN` is set and generated guides persist across deploys.
3. The agent route asks for up to 300 s (`maxDuration`); a typical run takes about a minute.

## Key decisions

1. **Lead with the gate, not the steps.** Registering an OAuth app takes about 10 minutes almost everywhere. Developers get burned by the approval gates: Google's CASA assessment for reading Gmail, Slack's 10-active-installs prerequisite and up-to-10-week review, LinkedIn's business vetting where a rejection burns the app. Each guide opens with a verdict (difficulty 1–5 plus a one-line headline) and a timeline that separates *your work* from *waiting*.
2. **Show ways around the wait.** Each guide lists paths: internal/test modes, unlisted distribution, and Composio's managed OAuth app (checked against the [managed-auth directory](https://docs.composio.dev/toolkits/managed-auth)), so a developer can ship today while approval runs.
3. **Agent vs. you, explicitly.** Every step has an owner. Agents research, choose minimal scopes, and draft scope justifications, screencast scripts and partner emails. They also generate **pre-filled app registrations** (GitHub App URL parameters, Slack `manifest_json` links), so you review and click Create. You handle anything needing your login, legal identity, payment, a recorded video, or a provider decision. The agent never signs in or creates accounts.
4. **Evidence is structural.** One schema for curated and generated guides. Every claim carries `tested | sourced | inferred` plus source ids. For generated guides, code (not the model) enforces this: citations to pages the agent didn't actually read are stripped and the claim is downgraded, and cited links are re-checked.
5. **Chat can't outrun the evidence.** Ask answers only from numbered facts and must cite them, so every sentence traces to a claim with its own evidence level. Anything beyond the facts is labelled general knowledge, never dressed up as sourced.
6. **Cheap by default, your choice if you care.** DeepSeek V4.1 Flash via OpenCode ($0.30 / $1.20 per 1M tokens) costs about 2–5¢ per guide. Mechanical steps (plan, pick links, check quotes) run with reasoning off, which is about 4× cheaper and much faster. Writing keeps reasoning on and streams it to the UI. Visitors can choose any model by bringing their own key (⚙ or `/model`). Keys are allow-listed by provider, used per request, and never stored server-side. Gemini's free tier is an automatic fallback.

## How the live agent works

`src/lib/agent/run.ts`. The steps stream to the UI as NDJSON.

| Step | What happens |
|---|---|
| Plan | LLM (reasoning off) identifies the app and proposes 5–8 official doc URLs |
| Read | Each URL is fetched, along with the docs host's `llms.txt` index if it has one. 404s, JS-only shells, login pages and duplicates are dropped and shown in the transcript. **Dead links are recovered**: a 404'd guess is matched to the live page on the same host whose path shares the most words (from `llms.txt`, then links on pages already read) |
| Follow | Code measures **topic coverage** (registration, scopes, review, limits, tokens, distribution) across the pages read. Links that would fill a missing topic outrank the rest, and the LLM is told which gaps to fill when it picks up to 7 more |
| Clean | Lines repeated across a site's pages (nav menus, footers) are stripped, so the writer and the quote checker read the docs, not the chrome. On Spotify this removed ~140k characters and raised verified quotes from 10/23 to 31/33 |
| Probe | Real GETs: `/.well-known/openid-configuration`, then the authorize endpoint with a fake `client_id`, to see if it exists and how it fails |
| Write | LLM writes the guide from numbered sources only, constrained by a JSON schema with enums |
| Check | Code validates citation ids. Then a **quote check**: for every `sourced` claim the model must return a verbatim supporting sentence, and code confirms it really occurs in that page's text. Claims that fail are downgraded to `inferred`. Links are re-checked. Each page then reports what it backed (claims citing it, quotes verified in it) in the sources panel |

## What we tested, sourced, and couldn't verify

See `/evidence` in the app. Highlights:

- **Corrected:** Slack review isn't "a few weeks". It's up to 10 business days plus up to 10 weeks, after 10 active installs. `gmail.readonly` is *restricted* (needs CASA), not "sensitive" as a third-party guide claimed. Notion renamed integrations to "connections". Several docs URLs (Slack, LinkedIn) were dead.
- **Confirmed by probe:** authorize endpoints for all five curated apps. Google fails fast with `invalid_client`, while GitHub, Notion and LinkedIn defer validation to their login UI.
- **Unverified:** provider review SLAs that aren't published (Notion, LinkedIn, Google restricted scopes, CASA cost and duration). We also never clicked through real consoles, because that needs signed-in provider accounts. These are labelled as estimates in the guides.

## Design

Riso and pixel posters: a grain-green field, pale-pink pixel type (Silkscreen), a cross-stitched wordmark where a cop chases a thief through the letters, Tetris blocks that drift and shatter on text, square corners. Each app's real logo is redrawn as pixel art over a brand-tinted grain tile. Curated logos come from Simple Icons 13.21.0 (CC0 icon data; trademarks belong to their owners, used only to identify each service) and are vendored in `public/logos`. For agent-generated guides, the logo is fetched once at generation time and embedded as a data URI, so viewers never call a third-party icon service. Animations respect `prefers-reduced-motion`.

## Limitations

- **Cost and abuse.** Each new guide costs the site owner about 2–5¢. Results are cached for 7 days, and fresh runs and questions on the shared key are capped per IP. Those caps are in-memory and per server instance, so put a real rate limiter in front for wide public use.
- **Quote checks prove a sentence exists, not that it fully supports the claim.** A strong filter against invented citations, not a substitute for human review.
- **Generated guides are unreviewed.** Read their evidence tags. Time estimates are usually `inferred`, and the wait chart inherits that (its detail line shows how much).
- **JS-only docs.** Pages that render only with JavaScript can't be read by the fetcher; the agent reports when sources were thin.
- **Five curated apps, not 100.** Scaling plan: run the agent over Composio's OAuth toolkit list, have a human review the inferred claims before marking a guide verified, and re-run on a schedule to catch provider changes (each source carries an access date).
- Not legal or compliance advice.

## Layout

```
src/app/                 pages: / · /guides/[slug] · /generate · /evidence · /how
src/app/api/             generate (agent stream) · ask (grounded chat stream)
src/lib/agent/           run.ts (pipeline), web.ts (fetch/probe), llm.ts, schema.ts, prompts.ts, providers.ts
src/lib/guides/          curated guides (typed data, one file per app)
src/lib/facts.ts         guides flattened into citable facts for Ask
src/lib/summary.ts       the small per-guide slice the search box and chart use
src/components/          SearchBox (commands), answer (shared chat bits), WaitChart, Handheld, SilkGrid, …
```
