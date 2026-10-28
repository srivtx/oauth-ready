import type { Guide } from "../types";
import { CHECKED, composioSource, probeSource, src } from "./common";

export const gmail: Guide = {
  slug: "gmail",
  name: "Gmail (Google)",
  website: "https://mail.google.com",
  category: "Email / Google Workspace",
  origin: "curated",
  generatedAt: CHECKED,
  verdict: {
    difficulty: 5,
    label: "Security assessment",
    headline:
      "Working in an hour for up to 100 test users. Reading mail in production needs restricted-scope verification plus an annual third-party security assessment (CASA). Plan for weeks and start early.",
  },
  timeToDev: "~1 hour (Testing mode, ≤100 users, 7-day refresh tokens)",
  timeToProd: "Send-only: ~1 week · Read/modify mail: several weeks + yearly CASA",
  managed: {
    composio: true,
    note: "Composio offers a managed Gmail app. That's the fastest way to ship while your own verification runs, but users will see Composio's app on the consent screen.",
  },
  paths: [
    {
      name: "Internal (Workspace only)",
      when: "Every user is in your own Google Workspace org.",
      outcome: "No verification, no 100-user cap. Only your org's users can connect.",
    },
    {
      name: "Testing mode",
      when: "Prototype, demo, design partners.",
      outcome: "Up to 100 users, 'unverified app' warning, refresh tokens expire after 7 days.",
    },
    {
      name: "Production: sensitive scopes only (e.g. gmail.send)",
      when: "Your agent only sends mail.",
      outcome: "Brand + sensitive-scope verification. Google says it typically takes 3–5 business days.",
    },
    {
      name: "Production: restricted scopes (gmail.readonly, gmail.modify, …)",
      when: "Your agent reads, triages or drafts mail. This is most AI-agent use cases.",
      outcome: "Restricted-scope verification plus a CASA security assessment, repeated every 12 months.",
    },
  ],
  phases: [
    { label: "Create Cloud project, consent screen, OAuth client", kind: "work", owner: "you", min: 30, max: 60, unit: "minutes", milestone: "dev", evidence: "inferred" },
    { label: "Verify domain in Search Console, publish privacy policy + homepage", kind: "work", owner: "you", min: 2, max: 8, unit: "hours", milestone: "prod", evidence: "sourced", sources: ["g-brand", "g-branding-help"] },
    { label: "Brand verification", kind: "wait", owner: "provider", min: 2, max: 3, unit: "days", milestone: "prod", evidence: "sourced", sources: ["g-brand"], note: "Automated check runs in minutes. Google says 2–3 business days overall." },
    { label: "Scope justification + demo video", kind: "work", owner: "you", min: 3, max: 8, unit: "hours", milestone: "prod", evidence: "sourced", sources: ["g-sensitive"] },
    { label: "Scope review (sensitive: 3–5 business days; restricted: several weeks)", kind: "wait", owner: "provider", min: 1, max: 6, unit: "weeks", milestone: "prod", evidence: "sourced", sources: ["g-sensitive", "g-restricted"] },
    { label: "CASA self-scan + fix findings (restricted scopes only)", kind: "work", owner: "you", min: 1, max: 5, unit: "days", milestone: "prod", evidence: "inferred", sources: ["casa-t2"], note: "Run the scan per the ADA guide and remediate. Effort depends on findings." },
    { label: "Assessor validation → Letter of Validation", kind: "wait", owner: "provider", min: 1, max: 6, unit: "weeks", milestone: "prod", evidence: "inferred", sources: ["casa-t2", "nylas"], note: "A third-party assessor, not Google. Nylas reported about 2 weeks with SOC 2 already in hand." },
  ],
  steps: [
    {
      title: "Pick the narrowest Gmail scope. It decides your entire timeline.",
      owner: "agent",
      milestone: "dev",
      detail:
        "gmail.labels is non-sensitive. gmail.send is sensitive. gmail.readonly, gmail.modify, gmail.compose, gmail.metadata and mail.google.com/ are RESTRICTED and trigger CASA. An agent can audit your code for requested scopes and propose the minimum.",
      evidence: "sourced",
      sources: ["gmail-scopes"],
    },
    {
      title: "Create separate Cloud projects for testing and production",
      owner: "you",
      milestone: "dev",
      detail: "Google's policy expects separate projects. Submit only the production project for verification.",
      url: "https://console.cloud.google.com/projectcreate",
      evidence: "sourced",
      sources: ["g-exempt", "g-brand"],
    },
    {
      title: "Configure branding, audience and an OAuth client (Web application)",
      owner: "you",
      milestone: "dev",
      detail:
        "In Google Auth Platform: Branding (app name, support email, logo), Audience (External + Testing; add test users), Clients (Web app, redirect URIs). Add authorized domains BEFORE adding redirect, homepage or privacy URLs.",
      url: "https://console.developers.google.com/auth/branding",
      evidence: "sourced",
      sources: ["g-branding-help"],
    },
    {
      title: "Ship to ≤100 test users while verification runs",
      owner: "you",
      milestone: "dev",
      detail:
        "In Testing mode users see an 'unverified app' screen and refresh tokens expire after 7 days (unless you only request name/email/profile). Build re-auth into the agent so it doesn't silently die every week.",
      evidence: "sourced",
      sources: ["g-oauth", "g-exempt"],
    },
    {
      title: "Verify domain ownership and publish homepage + privacy policy",
      owner: "you",
      milestone: "prod",
      detail:
        "Verify the top private domain in Google Search Console with a project Owner/Editor account. The homepage must be public, describe the app and link the privacy policy on the same domain. The policy must disclose Google user data handling and Limited Use.",
      url: "https://search.google.com/search-console/about",
      evidence: "sourced",
      sources: ["g-brand", "g-restricted"],
    },
    {
      title: "Draft scope justifications and a demo-video shot list",
      owner: "agent",
      milestone: "prod",
      detail:
        "For each scope, explain the feature and why a narrower scope isn't enough. The video must show the full OAuth flow and how each scope is used. An agent can draft both from your code and product description.",
      evidence: "sourced",
      sources: ["g-sensitive"],
      artifact: {
        label: "Scope justification template",
        kind: "text",
        content:
          "Scope: https://www.googleapis.com/auth/gmail.readonly\nFeature: <Agent name> summarizes the user's unread email each morning and drafts replies the user approves.\nWhy this scope: We must read message bodies to summarize them. gmail.metadata exposes headers only, and gmail.labels exposes no content.\nData handling: Message content is processed in memory, not stored beyond <N> days, never used to train models, and never shared with third parties. This complies with the Google API Services User Data Policy, including Limited Use.\nVideo: 0:00 sign-in + consent screen (shows app name + scope) → 0:40 summary feature using the scope → 1:30 data deletion control.",
      },
    },
    {
      title: "Submit in the Verification Center and watch both contact inboxes",
      owner: "you",
      milestone: "prod",
      detail: "Trust & Safety follows up by email to the developer contact and support emails. Missed emails stall the review.",
      url: "https://console.developers.google.com/auth/verification",
      evidence: "sourced",
      sources: ["g-sensitive"],
    },
    {
      title: "Complete CASA (restricted scopes only)",
      owner: "you",
      milestone: "prod",
      detail:
        "Google emails you when you're in scope. Tier 2: scan your app per the ADA guide, send results to an authorized assessor, receive a Letter of Validation. Existing certifications may speed this up. Repeat every 12 months.",
      url: "https://appdefensealliance.dev/casa/tier-2/tier2-overview",
      evidence: "sourced",
      sources: ["casa-t2", "g-restricted"],
    },
  ],
  requirements: [
    { text: "A domain you own, verified in Google Search Console, hosting the homepage and privacy policy.", evidence: "sourced", sources: ["g-brand", "g-branding-help"] },
    { text: "Privacy policy that discloses how Google user data is accessed, used, stored and shared, and complies with the Limited Use requirements.", evidence: "sourced", sources: ["g-restricted"] },
    { text: "A demo video showing the OAuth flow and scope usage (sensitive and restricted reviews).", evidence: "sourced", sources: ["g-sensitive"] },
    { text: "Restricted scopes accessed through your servers: annual CASA assessment by a Google-approved assessor.", evidence: "sourced", sources: ["g-restricted"] },
    { text: "Assessment fees may apply and vary by assessor. We could not find an authoritative current price.", evidence: "inferred" },
  ],
  scopes: [
    { name: "openid email profile", tier: "basic", note: "Identity only. Testing-mode refresh tokens don't expire after 7 days for these.", evidence: "sourced", sources: ["g-oauth"] },
    { name: "gmail.labels", tier: "basic", note: "Non-sensitive: see and edit labels.", evidence: "sourced", sources: ["gmail-scopes"] },
    { name: "gmail.send", tier: "sensitive", note: "Send on the user's behalf. Sensitive review, no CASA.", evidence: "sourced", sources: ["gmail-scopes"] },
    { name: "gmail.readonly", tier: "restricted", note: "Read messages. Restricted, needs CASA.", evidence: "sourced", sources: ["gmail-scopes"] },
    { name: "gmail.metadata", tier: "restricted", note: "Headers/labels only, but still restricted.", evidence: "sourced", sources: ["gmail-scopes"] },
    { name: "gmail.modify / gmail.compose", tier: "restricted", note: "Read+write / drafts. Restricted.", evidence: "sourced", sources: ["gmail-scopes"] },
    { name: "https://mail.google.com/", tier: "restricted", note: "Full access incl. permanent delete. Google says request only if you truly need immediate deletion.", evidence: "sourced", sources: ["gmail-scopes"] },
  ],
  gotchas: [
    { text: "gmail.metadata sounds harmless but is restricted. Some third-party guides wrongly list gmail.readonly as merely sensitive.", evidence: "sourced", sources: ["gmail-scopes"] },
    { text: "Testing mode issues 7-day refresh tokens, so agents silently lose access weekly.", evidence: "sourced", sources: ["g-oauth"] },
    { text: "Adding a new restricted scope later can trigger re-verification and reassessment. Get scope choices right first.", evidence: "sourced", sources: ["g-restricted"] },
    { text: "Workspace admins can block unverified or sensitive-scope apps for their org even after you're verified, so enterprise users may need admin allow-listing.", evidence: "sourced", sources: ["g-sensitive"] },
    { text: "The privacy policy must be on the same domain as the homepage. A Notion page or Google Doc won't pass.", evidence: "sourced", sources: ["g-restricted", "g-branding-help"] },
  ],
  blockers: [
    {
      problem: "Verification is taking weeks and you need to launch.",
      fix: "Launch on Composio's managed Gmail app, or Internal mode for your own org, while your own app is reviewed. Keep Testing mode for ≤100 design partners.",
      evidence: "sourced",
      sources: ["composio", "g-exempt"],
    },
    {
      problem: "Brand verification failed automatically.",
      fix: "Usually domain or branding mismatch: unverified authorized domain, privacy policy on another domain, or a name resembling a Google product. Fix it and re-run, or request manual review.",
      evidence: "sourced",
      sources: ["g-brand", "g-branding-help"],
    },
    {
      problem: "Reviewer asks you to justify a scope.",
      fix: "Reply in the Verification Center with the feature, the exact scope, and why narrower scopes fail. Downgrade to a narrower scope if you can't justify it.",
      evidence: "sourced",
      sources: ["g-sensitive"],
    },
  ],
  probes: [
    {
      label: "OIDC discovery document",
      url: "https://accounts.google.com/.well-known/openid-configuration",
      status: 200,
      observed: "authorization_endpoint = https://accounts.google.com/o/oauth2/v2/auth",
      meaning: "Standard OIDC, so any OAuth library works and endpoints are confirmed.",
      at: CHECKED,
    },
    {
      label: "Authorize endpoint with a fake client_id",
      url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=probe_invalid&response_type=code&scope=openid",
      status: 302,
      observed: "Redirect to /signin/oauth/error, authError decodes to 'invalid_client: The OAuth client was not found.'",
      meaning: "Google validates the client before login. A typo in client_id fails immediately and clearly.",
      at: CHECKED,
    },
  ],
  sources: [
    src("gmail-scopes", "Google — Choose Gmail API scopes", "https://developers.google.com/workspace/gmail/api/auth/scopes"),
    src("g-restricted", "Google — Restricted scope verification", "https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification"),
    src("g-sensitive", "Google — Sensitive scope verification", "https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification"),
    src("g-brand", "Google — Brand verification", "https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification"),
    src("g-branding-help", "Google Cloud Help — Manage OAuth app branding", "https://support.google.com/cloud/answer/10311615"),
    src("g-exempt", "Google Cloud Help — When is verification not needed", "https://support.google.com/cloud/answer/13464323"),
    src("g-oauth", "Google — Using OAuth 2.0 to access Google APIs", "https://developers.google.com/identity/protocols/oauth2"),
    src("casa-t2", "App Defense Alliance — CASA Tier 2 process", "https://appdefensealliance.dev/casa/tier-2/tier2-overview"),
    src("nylas", "Nylas — Google OAuth verification: costs, timelines", "https://www.nylas.com/blog/google-oauth-app-verification/", "third-party"),
    composioSource,
    probeSource,
  ],
  uncertainties: [
    "Google does not publish an SLA for restricted-scope review ('can take several weeks'). Our 1–6 week range is an estimate.",
    "CASA tier assignment, assessor fees and duration vary. We did not run an assessment.",
    "We did not submit an app for verification. Steps reflect current docs (console UI labels change often).",
  ],
};
