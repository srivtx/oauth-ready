import type { Guide } from "../types";
import { CHECKED, composioSource, probeSource, src } from "./common";

const manifest = {
  display_information: { name: "My Agent", description: "AI agent that works in your Slack" },
  features: { bot_user: { display_name: "My Agent", always_online: true } },
  oauth_config: {
    redirect_urls: ["https://example.com/slack/oauth/callback"],
    scopes: { bot: ["chat:write", "channels:read", "app_mentions:read"] },
  },
  settings: { org_deploy_enabled: false, socket_mode_enabled: false },
};

export const slack: Guide = {
  slug: "slack",
  name: "Slack",
  website: "https://slack.com",
  category: "Communication",
  origin: "curated",
  generatedAt: CHECKED,
  verdict: {
    difficulty: 3,
    label: "Review gate (commercial)",
    headline:
      "Build and install in under an hour. Selling to other companies means Marketplace approval, which requires 10 active workspaces before you can even submit and up to ~10 weeks of review. Unlisted apps get 1 req/min on message history.",
  },
  timeToDev: "~30 minutes (your own workspace)",
  timeToProd: "Unlisted pilot: same day · Marketplace: ~2–3 months incl. 10-install prerequisite",
  managed: {
    composio: true,
    note: "Composio offers a managed Slack app. Your own app gives you your bot name/icon and your own rate limits, and is what Marketplace review is about.",
  },
  paths: [
    {
      name: "Single workspace (internal)",
      when: "The agent only runs in your own company's Slack.",
      outcome: "No review. Full rate limits. One-click install generates a token.",
    },
    {
      name: "Unlisted distribution",
      when: "Pilots with early customers.",
      outcome: "Other workspaces can install via 'Add to Slack'. conversations.history/replies are limited to 1 request/min for new commercial installs.",
    },
    {
      name: "Slack Marketplace",
      when: "Commercial distribution, which Slack's terms say is the only appropriate channel.",
      outcome: "Manual review: preliminary (≤10 business days) + functional (≤10 weeks). Full rate limits.",
    },
  ],
  phases: [
    { label: "Create app from manifest + install to your workspace", kind: "work", owner: "agent", min: 10, max: 30, unit: "minutes", milestone: "dev", evidence: "sourced", sources: ["slack-manifest", "slack-dist"] },
    { label: "Build OAuth install flow (multi-workspace, state param, HTTPS redirect)", kind: "work", owner: "agent", min: 2, max: 6, unit: "hours", milestone: "prod", evidence: "inferred", sources: ["slack-dist"] },
    { label: "Reach 10 active workspaces (prerequisite to submit)", kind: "wait", owner: "you", min: 2, max: 8, unit: "weeks", milestone: "prod", evidence: "inferred", sources: ["slack-review"], note: "The requirement is sourced. How long it takes you depends on your go-to-market." },
    { label: "Listing assets, test account, demo video", kind: "work", owner: "you", min: 4, max: 8, unit: "hours", milestone: "prod", evidence: "sourced", sources: ["slack-review"] },
    { label: "Preliminary review", kind: "wait", owner: "provider", min: 1, max: 2, unit: "weeks", milestone: "prod", evidence: "sourced", sources: ["slack-review"], note: "Up to 10 business days. The queue resets on each resubmission." },
    { label: "Functional review", kind: "wait", owner: "provider", min: 2, max: 10, unit: "weeks", milestone: "prod", evidence: "sourced", sources: ["slack-review"], note: "'Up to 10 weeks' for new submissions. Slack won't expedite." },
  ],
  steps: [
    {
      title: "Create the app from a manifest (pre-filled link)",
      owner: "agent",
      milestone: "dev",
      detail:
        "Slack accepts a manifest in the create-app URL, so an agent can generate the full config (scopes, redirect URLs, bot user) and you just pick a workspace and confirm.",
      evidence: "sourced",
      sources: ["slack-manifest"],
      artifact: {
        label: "Create Slack app from this manifest",
        kind: "link",
        content: `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(manifest))}`,
      },
    },
    {
      title: "Install to your workspace and test",
      owner: "you",
      milestone: "dev",
      detail: "Install App → Install to Workspace gives you a bot token for your own workspace with no OAuth code needed.",
      url: "https://api.slack.com/apps",
      evidence: "sourced",
      sources: ["slack-dist"],
    },
    {
      title: "Implement OAuth v2 for other workspaces",
      owner: "agent",
      milestone: "prod",
      detail:
        "Required before any other workspace can install. All redirect URLs must be HTTPS. Use the `state` parameter. For Enterprise installs, check the user's domain matches the customer.",
      evidence: "sourced",
      sources: ["slack-dist", "slack-review"],
    },
    {
      title: "Activate public (unlisted) distribution",
      owner: "you",
      milestone: "prod",
      detail: "Manage Distribution → Activate Public Distribution. You get an 'Add to Slack' button and a shareable install URL. It's also a prerequisite for Marketplace submission.",
      evidence: "sourced",
      sources: ["slack-dist"],
    },
    {
      title: "Get 10+ active workspaces using it",
      owner: "you",
      milestone: "prod",
      detail: "Marketplace submission is blocked until the app is installed on ≥10 workspaces active in the last 28 days.",
      evidence: "sourced",
      sources: ["slack-review"],
    },
    {
      title: "Prepare submission: scope reasons, test account, demo video",
      owner: "agent",
      milestone: "prod",
      detail:
        "Reviewers need test credentials (paid tier if required) with dummy data, and a video of install → OAuth → setup → use → uninstall. Only request scopes for features that exist today. An agent can draft scope reasons and the video script.",
      evidence: "sourced",
      sources: ["slack-review"],
    },
    {
      title: "Submit to Slack Marketplace",
      owner: "you",
      milestone: "prod",
      detail: "From the app's 'Submit to the Slack Marketplace' section. Check the estimated review time shown on the submission page.",
      evidence: "sourced",
      sources: ["slack-review"],
    },
  ],
  requirements: [
    { text: "HTTPS for all OAuth redirect URLs once the app is installable by other workspaces.", evidence: "sourced", sources: ["slack-dist"] },
    { text: "Marketplace: ≥10 active workspace installs before submission.", evidence: "sourced", sources: ["slack-review"] },
    { text: "Marketplace: production-ready app, test credentials, and ideally a demo video.", evidence: "sourced", sources: ["slack-review"] },
    { text: "Marketplace: app meets the listing guidelines. Some app categories are not accepted.", evidence: "sourced", sources: ["slack-guidelines"] },
  ],
  scopes: [
    { name: "chat:write", tier: "basic", note: "Post messages as the bot.", evidence: "inferred" },
    { name: "app_mentions:read", tier: "basic", note: "React when @mentioned.", evidence: "inferred" },
    { name: "channels:history / conversations.history", tier: "gated", note: "Unlisted commercial apps: 1 request/min. Marketplace apps keep normal limits.", evidence: "sourced", sources: ["slack-rl"] },
  ],
  gotchas: [
    { text: "Since May 2025, conversations.history and conversations.replies are limited to 1 request/min for commercially distributed non-Marketplace apps. That's crippling for agents that read context.", evidence: "sourced", sources: ["slack-rl"] },
    { text: "Slack's API terms say the Marketplace is the only appropriate channel for commercial distribution. Unlisted is for pilots.", evidence: "sourced", sources: ["slack-rl", "slack-dist"] },
    { text: "Every resubmission during preliminary review puts you back in the queue.", evidence: "sourced", sources: ["slack-review"] },
    { text: "Don't request scopes for future features. Reviewers only approve what they can test, and adding scopes later forces users to reinstall.", evidence: "sourced", sources: ["slack-review"] },
    { text: "Some workspaces only allow Marketplace apps or require admin approval, so unlisted apps may be blocked at install.", evidence: "sourced", sources: ["slack-dist"] },
  ],
  blockers: [
    {
      problem: "Agent can't read enough history (rate-limited).",
      fix: "Use events (message.* subscriptions) instead of polling history, cache aggressively, and prioritize Marketplace approval. Internal apps are unaffected.",
      evidence: "inferred",
      sources: ["slack-rl"],
    },
    {
      problem: "Can't submit: fewer than 10 active installs.",
      fix: "Run unlisted pilots with design partners first. Launching on the managed Composio Slack app meanwhile doesn't count toward your app's installs.",
      evidence: "sourced",
      sources: ["slack-review", "composio"],
    },
    {
      problem: "Customer's workspace blocks the install.",
      fix: "Ask their admin to approve the app request (admin approval flow), or wait for Marketplace listing.",
      evidence: "sourced",
      sources: ["slack-dist"],
    },
  ],
  probes: [
    {
      label: "OIDC discovery document",
      url: "https://slack.com/.well-known/openid-configuration",
      status: 200,
      observed: "authorization_endpoint = https://slack.com/openid/connect/authorize",
      meaning: "Sign in with Slack (OIDC) is available. Bot installs use /oauth/v2/authorize instead.",
      at: CHECKED,
    },
    {
      label: "OAuth v2 authorize with a fake client_id",
      url: "https://slack.com/oauth/v2/authorize?client_id=probe_invalid&scope=channels:read",
      status: 200,
      observed: "Returns an HTML page (no redirect)",
      meaning: "Endpoint is live. Slack renders its error/sign-in page rather than an HTTP error.",
      at: CHECKED,
    },
    {
      label: "Old docs URL",
      url: "https://docs.slack.dev/distribution",
      status: 200,
      observed: "Page renders a 404 ('West of a white house')",
      meaning: "Slack moved docs to docs.slack.dev/app-management/distribution/. Old links in blogs are stale.",
      at: CHECKED,
    },
  ],
  sources: [
    src("slack-dist", "Slack — App distribution", "https://docs.slack.dev/app-management/distribution/"),
    src("slack-review", "Slack — Marketplace review guide", "https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide"),
    src("slack-guidelines", "Slack — Marketplace app guidelines and requirements", "https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements/"),
    src("slack-rl", "Slack changelog — 2025 terms & rate-limit update FAQ", "https://api.slack.com/changelog/2025-05-terms-rate-limit-update-and-faq"),
    src("slack-manifest", "Slack — Configuring apps with app manifests", "https://docs.slack.dev/app-manifests/configuring-apps-with-app-manifests/"),
    composioSource,
    probeSource,
  ],
  uncertainties: [
    "Review times are Slack's stated maximums ('up to'). Actual times vary with volume, and the submission page shows a live estimate.",
    "Time to reach 10 active installs depends entirely on your distribution.",
    "We did not create a real Slack app. The manifest link format is from Slack's docs, not a recorded click-through.",
  ],
};
