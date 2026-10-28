// What we checked while building the library: claims we started with (from
// memory, search summaries or third-party posts) vs what the fetched primary
// sources and live probes actually showed. Checked 2026-10-28.

export interface Check {
  app: string;
  claim: string;
  outcome: "corrected" | "confirmed" | "unverified";
  finding: string;
  how: "doc" | "probe" | "attempt";
  url?: string;
}

export const CHECKS: Check[] = [
  // Corrected
  {
    app: "Slack",
    claim: "Marketplace review takes 'a few weeks'.",
    outcome: "corrected",
    finding:
      "Preliminary review takes up to 10 business days, functional review up to 10 weeks for new apps, and the queue resets on each resubmission. You also can't submit until you have 10+ active workspace installs.",
    how: "doc",
    url: "https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide",
  },
  {
    app: "Gmail",
    claim: "gmail.readonly is a 'sensitive' scope (third-party verification guide).",
    outcome: "corrected",
    finding: "Google's Gmail scopes page lists gmail.readonly, and even gmail.metadata, as RESTRICTED, which means CASA. Only gmail.send / add-on scopes are sensitive.",
    how: "doc",
    url: "https://developers.google.com/workspace/gmail/api/auth/scopes",
  },
  {
    app: "Notion",
    claim: "Create a 'public integration' at notion.so/my-integrations (most tutorials).",
    outcome: "corrected",
    finding: "Notion now calls them 'connections' (internal, public, plus personal access tokens). Public connections choose an installation scope at creation, and only 'any workspace' is Marketplace-eligible.",
    how: "doc",
    url: "https://developers.notion.com/guides/get-started/overview",
  },
  {
    app: "Slack",
    claim: "Distribution docs live at docs.slack.dev/distribution.",
    outcome: "corrected",
    finding: "That URL renders Slack's 404 page. Current docs are at /app-management/distribution/. The live agent checks every link it cites for this reason.",
    how: "probe",
    url: "https://docs.slack.dev/app-management/distribution/",
  },
  {
    app: "LinkedIn",
    claim: "Community Management access docs at …/community-management/community-management-api-access.",
    outcome: "corrected",
    finding: "404. The access process is documented at /linkedin/marketing/community-management-app-review.",
    how: "probe",
    url: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review",
  },
  {
    app: "GitHub",
    claim: "Expiring user tokens last ~8 hours (from memory).",
    outcome: "corrected",
    finding: "Not stated on the pages we fetched, so we removed the number and kept only the sourced fact that expiry is on by default.",
    how: "doc",
    url: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app",
  },
  {
    app: "Agent design",
    claim: "The free Gemini key can do Google Search grounding for discovery.",
    outcome: "corrected",
    finding: "Returned 429 RESOURCE_EXHAUSTED on the free key. The agent now proposes candidate URLs, then fetches and verifies each one itself, so every cited source is one it actually read.",
    how: "attempt",
  },
  {
    app: "Agent design",
    claim: "The Gemini free tier is plenty for a live demo.",
    outcome: "corrected",
    finding:
      "gemini-3-flash allows 20 requests/day per project on the free tier, and our test runs used that up. Cheap steps now run on a lite model, writing falls back down a model chain, and finished guides are cached for 7 days.",
    how: "attempt",
  },
  {
    app: "Agent design",
    claim: "Asking the model to label evidence in the prompt is enough.",
    outcome: "corrected",
    finding:
      "A fallback model put claim text in the evidence field. Labels are now enforced twice: a JSON schema with enums at generation time, then code that downgrades any claim citing a source the agent never read.",
    how: "attempt",
  },

  {
    app: "Agent design",
    claim: "A valid citation id means the claim is supported.",
    outcome: "corrected",
    finding:
      "Not necessarily: a model can cite a real page for something it doesn't say. The agent now has to return a verbatim supporting sentence, and code checks that sentence is in the page. On test runs, 28/31 (HubSpot) and 36/38 (Calendly) passed. The rest were downgraded to inferred.",
    how: "attempt",
  },
  {
    app: "Agent design",
    claim: "Asking the model for a few URLs is enough to find the right docs.",
    outcome: "corrected",
    finding:
      "Guessed doc URLs are often stale (3 of 8 were 404 for Calendly and Dropbox). Many doc sites publish llms.txt: Zoom indexed 818 links, Calendly 106. Reading it led the agent to the actual app-review and rate-limit pages.",
    how: "attempt",
  },

  // Confirmed
  {
    app: "Gmail",
    claim: "Testing-mode apps get 7-day refresh tokens and a 100-user cap.",
    outcome: "confirmed",
    finding: "Both stated by Google (OAuth 2.0 overview; 'When is verification not needed').",
    how: "doc",
    url: "https://developers.google.com/identity/protocols/oauth2",
  },
  {
    app: "Gmail",
    claim: "Sensitive scope review: 3–5 business days. Brand verification: 2–3 business days.",
    outcome: "confirmed",
    finding: "Both figures appear verbatim in Google's production-readiness docs. Restricted review has no number, only 'several weeks'.",
    how: "doc",
    url: "https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification",
  },
  {
    app: "Slack",
    claim: "Unlisted commercial apps are rate-limited on conversations.history.",
    outcome: "confirmed",
    finding: "1 request/min for conversations.history and .replies, unless approved for the Marketplace. Internal apps are unaffected.",
    how: "doc",
    url: "https://api.slack.com/changelog/2025-05-terms-rate-limit-update-and-faq",
  },
  {
    app: "LinkedIn",
    claim: "A rejected app can't re-apply.",
    outcome: "confirmed",
    finding: "LinkedIn: create a new app and submit a new Development tier request. Development tier allows 500 calls/app and 100/member per 24h.",
    how: "doc",
    url: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review",
  },
  {
    app: "GitHub · Slack",
    claim: "An agent can pre-fill app registration.",
    outcome: "confirmed",
    finding: "GitHub Apps accept URL parameters on /settings/apps/new. Slack accepts manifest_json on api.slack.com/apps?new_app=1.",
    how: "doc",
    url: "https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-using-url-parameters",
  },
  {
    app: "All five",
    claim: "Authorize endpoints in the guides are real.",
    outcome: "confirmed",
    finding:
      "Probed with a dummy client_id. Google fails fast ('invalid_client'). GitHub and Notion redirect to login/install UIs. Slack and LinkedIn render HTML. Google, Slack and LinkedIn serve OIDC discovery.",
    how: "probe",
  },

  // Unverified
  {
    app: "Gmail",
    claim: "CASA assessment takes 1–6 weeks and costs money.",
    outcome: "unverified",
    finding: "Google says 'several weeks' with no figure. One vendor (Nylas) reported about 2 weeks with SOC 2. No authoritative price found.",
    how: "doc",
  },
  {
    app: "Notion · LinkedIn",
    claim: "Review timelines.",
    outcome: "unverified",
    finding: "Neither publishes an SLA. Our ranges are labeled as estimates in the guides.",
    how: "doc",
  },
  {
    app: "All",
    claim: "Steps match the current console UI.",
    outcome: "unverified",
    finding: "Creating real apps needs signed-in provider accounts, which an automated agent shouldn't create. A human click-through is the next verification step.",
    how: "attempt",
  },
];
