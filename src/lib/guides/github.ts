import type { Guide } from "../types";
import { CHECKED, composioSource, probeSource, src } from "./common";

export const github: Guide = {
  slug: "github",
  name: "GitHub",
  website: "https://github.com",
  category: "Developer tools",
  origin: "curated",
  generatedAt: CHECKED,
  verdict: {
    difficulty: 1,
    label: "Self-serve",
    headline:
      "No approval gate. Register in about 10 minutes and any GitHub user can connect right away. The real decision is OAuth app vs GitHub App.",
  },
  timeToDev: "~15 minutes",
  timeToProd: "Same day (no provider review)",
  managed: {
    composio: true,
    note: "Composio offers a managed GitHub OAuth app. Bring your own only for your brand on the consent screen, custom scopes, or a separate rate-limit quota.",
  },
  paths: [
    {
      name: "OAuth app",
      when: "Your agent acts only as the signed-in user and broad scopes like `repo` are acceptable.",
      outcome: "Fastest setup. Tokens can access every repo the user can.",
    },
    {
      name: "GitHub App (recommended by GitHub)",
      when: "You want per-repo access, fine-grained permissions, short-lived tokens, or to act without a user.",
      outcome: "Slightly more setup. Users choose which repos to grant, which security reviewers prefer.",
    },
  ],
  phases: [
    { label: "Register the app", kind: "work", owner: "you", min: 5, max: 15, unit: "minutes", milestone: "dev", evidence: "sourced", sources: ["gh-create"] },
    { label: "Wire up the OAuth flow + token refresh", kind: "work", owner: "agent", min: 1, max: 3, unit: "hours", milestone: "dev", evidence: "inferred", note: "Our estimate for a developer using an OAuth library." },
    { label: "Org owners approve your app (only if the org restricts OAuth apps)", kind: "wait", owner: "provider", min: 0, max: 3, unit: "days", milestone: "prod", evidence: "inferred", sources: ["gh-orgrestrict"], note: "No GitHub review. The wait is the customer's org owner, if they enabled restrictions." },
  ],
  steps: [
    {
      title: "Choose OAuth app vs GitHub App",
      owner: "agent",
      milestone: "dev",
      detail:
        "GitHub's own docs nudge you toward a GitHub App: fine-grained permissions, user-selected repositories, short-lived tokens. Pick an OAuth app only if you need the simplest act-as-user flow.",
      evidence: "sourced",
      sources: ["gh-create", "gh-diff"],
    },
    {
      title: "Register the app under a user or an org you administer",
      owner: "you",
      milestone: "dev",
      detail:
        "Settings → Developer settings → OAuth apps → New OAuth App. Fill in name, homepage URL and authorization callback URL (up to 10 callback URLs). Use only public information; the form warns against internal URLs.",
      url: "https://github.com/settings/applications/new",
      evidence: "sourced",
      sources: ["gh-create"],
    },
    {
      title: "Or: open a pre-filled GitHub App registration",
      owner: "agent",
      milestone: "dev",
      detail:
        "GitHub Apps accept URL parameters on the registration page, so an agent can prepare the whole form and you review and click Create. Replace the callback URL with yours.",
      evidence: "sourced",
      sources: ["gh-url"],
      artifact: {
        label: "Pre-filled GitHub App registration link",
        kind: "link",
        content:
          "https://github.com/settings/apps/new?name=my-agent&description=AI%20agent%20integration&url=https://example.com&callback_urls[]=https://example.com/oauth/callback&request_oauth_on_install=true&public=true&contents=read&issues=write&webhook_active=false",
      },
    },
    {
      title: "Generate a client secret and store it in your secret manager",
      owner: "you",
      milestone: "dev",
      detail: "Only you can see it in the app settings. Never commit it. Composio or your backend reads it from env.",
      evidence: "inferred",
    },
    {
      title: "Handle expiring user tokens",
      owner: "agent",
      milestone: "dev",
      detail:
        "'Expire user access tokens' is ON by default for new OAuth apps. Your integration must store and use refresh tokens, or uncheck the box until it does.",
      evidence: "sourced",
      sources: ["gh-create", "gh-authz"],
    },
    {
      title: "Request the narrowest scopes",
      owner: "agent",
      milestone: "dev",
      detail: "For OAuth apps, `read:user` and `user:email` cover identity. `repo` grants full control of private repos, so request it only if the agent writes code.",
      evidence: "sourced",
      sources: ["gh-scopes"],
    },
    {
      title: "Tell enterprise users how to get org approval",
      owner: "you",
      milestone: "prod",
      detail:
        "If a customer's org enabled OAuth app access restrictions, members can't authorize your app for org resources until an org owner approves it. Put a 'request approval' note in your onboarding.",
      evidence: "sourced",
      sources: ["gh-orgrestrict"],
    },
  ],
  requirements: [
    { text: "A GitHub personal account, or admin on the organization that will own the app.", evidence: "sourced", sources: ["gh-create"] },
    { text: "A user or organization can own up to 100 OAuth apps.", evidence: "sourced", sources: ["gh-create"] },
    { text: "No privacy policy, domain verification or security review required to go live.", evidence: "inferred", sources: ["gh-create"] },
  ],
  scopes: [
    { name: "read:user", tier: "basic", note: "Read profile data.", evidence: "sourced", sources: ["gh-scopes"] },
    { name: "user:email", tier: "basic", note: "Read the user's email addresses.", evidence: "sourced", sources: ["gh-scopes"] },
    { name: "repo", tier: "basic", note: "Full control of private repos. No review, but org owners and security teams will push back.", evidence: "sourced", sources: ["gh-scopes"] },
  ],
  gotchas: [
    { text: "OAuth app tokens can reach every repo the user can. Enterprise buyers often require a GitHub App instead.", evidence: "sourced", sources: ["gh-diff"] },
    { text: "Org OAuth app access restrictions silently hide org repos from your token until an owner approves the app.", evidence: "sourced", sources: ["gh-orgrestrict"] },
    { text: "Expiring tokens are the default. Code that stores only the access token breaks once it expires.", evidence: "sourced", sources: ["gh-authz"] },
  ],
  blockers: [
    {
      problem: "Users connect fine but the agent can't see their company's repos.",
      fix: "The org has OAuth app restrictions. Ask the user to request approval (Settings → Applications) or have an org owner approve it, or switch to a GitHub App installed on the org.",
      evidence: "sourced",
      sources: ["gh-orgrestrict"],
    },
    {
      problem: "redirect_uri mismatch error.",
      fix: "The redirect URI must match one of the registered callback URLs exactly (scheme, host, path).",
      evidence: "sourced",
      sources: ["gh-authz"],
    },
  ],
  probes: [
    {
      label: "Authorize endpoint with a fake client_id",
      url: "https://github.com/login/oauth/authorize?client_id=probe_invalid",
      status: 302,
      observed: "Redirect to github.com/login?client_id=probe_invalid",
      meaning: "Endpoint is live. GitHub defers client validation until after login, so a bad client_id won't fail fast in testing.",
      at: CHECKED,
    },
  ],
  sources: [
    src("gh-create", "GitHub Docs — Creating an OAuth app", "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app"),
    src("gh-diff", "GitHub Docs — Differences between GitHub Apps and OAuth apps", "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps"),
    src("gh-authz", "GitHub Docs — Authorizing OAuth apps", "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps"),
    src("gh-scopes", "GitHub Docs — Scopes for OAuth apps", "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps"),
    src("gh-url", "GitHub Docs — Registering a GitHub App using URL parameters", "https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-using-url-parameters"),
    src("gh-orgrestrict", "GitHub Docs — About OAuth app access restrictions", "https://docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/about-oauth-app-access-restrictions"),
    composioSource,
    probeSource,
  ],
  uncertainties: [
    "We did not register a real app (that needs a signed-in GitHub account). Step order follows the docs, not a recorded attempt.",
    "The implementation-time estimate is ours, not GitHub's.",
    "GitHub Marketplace listing (optional, for paid apps) has its own review that this guide does not cover.",
  ],
};
