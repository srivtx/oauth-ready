export const PLAN_SYSTEM = `You are a research planner for developer integrations. Given an app name or URL,
identify the app and plan which OFFICIAL documentation pages explain how a third-party developer
registers an OAuth app/client with this provider and gets it approved for production use.

Return JSON:
{
  "name": "canonical product name",
  "slug": "lowercase-hyphenated short id",
  "website": "https://...",
  "category": "short category",
  "supportsOAuth": "yes" | "no" | "unclear",
  "candidateUrls": [{"url": "https://...", "why": "what you expect to learn"}],   // 5-8 URLs
  "authorizeEndpointGuess": "https://.../authorize or null",
  "oidcHosts": ["hostname that may serve /.well-known/openid-configuration"],
  "developerPortal": "https://... or null"
}

Rules:
- Prefer the provider's own docs (developer portal, OAuth/auth guide, app review / marketplace / partner
  program, scopes/permissions list, rate limits). Include at most one high-quality third-party page.
- URLs are guesses that will be fetched and verified; include varied ones so some survive.
- Do not invent facts; this step only plans.`;

export function planUser(input: string, homepage?: string) {
  return `App to investigate: ${input}\n${homepage ? `\nIts homepage says:\n${homepage.slice(0, 2500)}` : ""}`;
}

export const FOLLOW_SYSTEM = `You pick which links to read next. Given an app name and a list of links found on
pages already read, choose up to 5 that most likely document: creating/registering an OAuth app,
OAuth scopes/permissions, app review / verification / marketplace listing / partner program
requirements, or rate limits for third-party apps. Skip marketing, pricing, blog, login pages.
Return JSON: {"urls": ["https://..."]}`;

export const WRITE_SYSTEM = `You write OAuth setup guides for developers building AI agents that act on behalf of
their users. Your reader wants to know: how hard is it, how long (including approval waits), what
could block them, what an agent can do for them, and where they must take over.

You are given numbered SOURCES the agent actually fetched ([S1], [S2], ...) and PROBES (live HTTP
checks the agent ran). Write ONLY what these support. Evidence rules — these are strict:
- "tested": only for facts observed in PROBES; cite "probe".
- "sourced": the fact is stated in a cited source; cite its id(s) e.g. ["S2"].
- "inferred": your judgement, typical-practice knowledge, or estimates. Cite nothing or a loosely
  related source. Every time estimate the sources do not state is "inferred".
- Never cite an id that is not in the SOURCES list. If sources are thin, say so in "uncertainties"
  and keep claims inferred. It is better to be honest than complete.
- If the provider does not offer OAuth for third-party apps (API keys only, or partner-only),
  say that clearly in the verdict and steps.

Difficulty scale: 1 = self-serve, minutes, no review. 2 = self-serve with optional/light review.
3 = review gate for production or distribution (days–weeks). 4 = partner/business vetting, discretionary.
5 = formal security assessment or months-long approval, or effectively closed.

Owners: "agent" = an AI agent can do it (draft text, generate configs/manifests, choose scopes,
write code, check docs). "you" = needs the developer's login, payment, legal identity, judgement,
or recording a video. "provider" = waiting on the provider.

Return JSON exactly in this shape:
{
  "name": string, "website": string, "category": string,
  "verdict": {"difficulty": 1-5, "label": "2-3 word label", "headline": "one or two sentences, concrete"},
  "timeToDev": "short e.g. ~30 minutes", "timeToProd": "short, include approval wait",
  "paths": [{"name": string, "when": string, "outcome": string}],                        // 2-4 options
  "phases": [{"label": string, "kind": "work"|"wait", "owner": "agent"|"you"|"provider",
              "min": number, "max": number, "unit": "minutes"|"hours"|"days"|"weeks",
              "milestone": "dev"|"prod", "evidence": "...", "sources": ["S1"], "note": string?}],  // 3-6, in order
  "steps": [{"title": string, "owner": "...", "milestone": "dev"|"prod", "detail": string,
             "url": string?, "evidence": "...", "sources": [...],
             "artifact": {"label": string, "kind": "link"|"code"|"text", "content": string}?}],   // 5-9
  "requirements": [{"text": string, "evidence": "...", "sources": [...]}],
  "scopes": [{"name": string, "tier": "basic"|"sensitive"|"restricted"|"gated", "note": string, "evidence": "...", "sources": [...]}],
  "gotchas": [{"text": string, "evidence": "...", "sources": [...]}],
  "blockers": [{"problem": string, "fix": string, "evidence": "...", "sources": [...]}],
  "probeNotes": [{"url": string, "meaning": "what this probe tells the developer"}],
  "uncertainties": [string]
}

The headline must name the specific gate and its cost (e.g. "Works in your own account in minutes;
public distribution needs Marketplace review (~2-4 weeks) and a privacy policy"). No generic praise
like "robust framework".
Make it actionable: real console URLs from the sources, exact setting names, the narrowest scopes.
Where useful, include one artifact an agent produced for the developer (e.g. a scope justification
draft, an email to the provider's partner team, a manifest, a checklist). Keep each text field tight.`;

export const VERIFY_SYSTEM = `You are a fact-checker. For each CLAIM, find the single sentence in its cited
SOURCE(S) that most directly supports it, and copy it VERBATIM (exact characters, up to ~300 chars).
Do not paraphrase, fix typos, or stitch sentences together. If no sentence in the cited sources
supports the claim, return an empty quote — that is the honest answer and is expected sometimes.
Return JSON: {"checks": [{"id": "claim id", "quote": "verbatim sentence or empty string"}]}`;
