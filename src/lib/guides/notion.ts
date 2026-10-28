import type { Guide } from "../types";
import { CHECKED, composioSource, probeSource, src } from "./common";

export const notion: Guide = {
  slug: "notion",
  name: "Notion",
  website: "https://notion.com",
  category: "Docs / knowledge",
  origin: "curated",
  generatedAt: CHECKED,
  verdict: {
    difficulty: 2,
    label: "Self-serve (+ optional review)",
    headline:
      "Create a public connection and OAuth works for any workspace. Marketplace listing needs a security review. The real surprise: your agent only sees pages users pick at consent.",
  },
  timeToDev: "~20 minutes",
  timeToProd: "Same day unlisted · Marketplace listing: review (no published SLA)",
  managed: {
    composio: true,
    note: "Composio offers a managed Notion app. Bring your own to show your name in Notion's page picker and to list in the Notion Marketplace.",
  },
  paths: [
    {
      name: "Personal access token / internal connection",
      when: "Scripts or an agent for your own workspace.",
      outcome: "No OAuth, no review. One workspace (or one user) only.",
    },
    {
      name: "Public connection, selected workspaces",
      when: "Pilot with named customer workspaces.",
      outcome: "OAuth for each user, but only workspaces you pick at creation. Not Marketplace-eligible.",
    },
    {
      name: "Public connection, any workspace",
      when: "Any Notion user should be able to connect.",
      outcome: "OAuth for everyone. Marketplace-eligible after Notion's security review.",
    },
  ],
  phases: [
    { label: "Create public connection in the Developer portal", kind: "work", owner: "you", min: 10, max: 20, unit: "minutes", milestone: "dev", evidence: "sourced", sources: ["notion-auth"] },
    { label: "Implement OAuth + page-picker aware UX", kind: "work", owner: "agent", min: 2, max: 4, unit: "hours", milestone: "dev", evidence: "inferred" },
    { label: "Marketplace security review (optional)", kind: "wait", owner: "provider", min: 1, max: 4, unit: "weeks", milestone: "prod", evidence: "inferred", note: "Notion doesn't publish a timeline. This range is our estimate." },
  ],
  steps: [
    {
      title: "Decide the installation scope up front",
      owner: "agent",
      milestone: "dev",
      detail: "'Any workspace' (Marketplace-eligible) vs 'Selected workspaces only' (not eligible). You choose at creation time.",
      evidence: "sourced",
      sources: ["notion-public"],
    },
    {
      title: "Create a public connection in the Developer portal",
      owner: "you",
      milestone: "dev",
      detail: "Fill in connection details, redirect URI(s) under OAuth configuration, and capabilities (read/update/insert content, comments…). Note that Notion now calls integrations 'connections'.",
      url: "https://www.notion.so/profile/integrations",
      evidence: "sourced",
      sources: ["notion-auth", "notion-ov"],
    },
    {
      title: "Copy client ID/secret from the Configuration tab",
      owner: "you",
      milestone: "dev",
      detail: "Store them in your secret manager. Never ship them to the browser.",
      evidence: "sourced",
      sources: ["notion-auth"],
    },
    {
      title: "Build the authorize URL and token exchange",
      owner: "agent",
      milestone: "dev",
      detail: "Authorize: https://api.notion.com/v1/oauth/authorize with client_id, response_type=code, owner=user, redirect_uri. Exchange the code at /v1/oauth/token with HTTP Basic auth (client_id:secret).",
      evidence: "tested",
      sources: ["notion-auth", "probe"],
    },
    {
      title: "Design for the page picker",
      owner: "agent",
      milestone: "dev",
      detail: "Users choose which pages to grant during OAuth. Your agent sees nothing else. Offer a template, or tell users to share the right pages, or the agent will look broken.",
      evidence: "sourced",
      sources: ["notion-public", "notion-auth"],
    },
    {
      title: "Submit for Marketplace listing (optional)",
      owner: "you",
      milestone: "prod",
      detail: "Listing requires passing Notion's security review. You can run a public connection without listing it.",
      evidence: "sourced",
      sources: ["notion-public"],
    },
  ],
  requirements: [
    { text: "A Notion workspace where you can create connections (workspace owner for internal connections).", evidence: "sourced", sources: ["notion-auth"] },
    { text: "Redirect URI(s) registered on the connection.", evidence: "sourced", sources: ["notion-auth"] },
    { text: "Privacy policy and terms URLs are expected for public connections.", evidence: "inferred", sources: ["n8n"] },
  ],
  scopes: [
    { name: "Read content", tier: "basic", note: "Notion uses 'capabilities', not OAuth scope strings.", evidence: "sourced", sources: ["notion-ov"] },
    { name: "Update / Insert content", tier: "basic", note: "Write capabilities.", evidence: "sourced", sources: ["notion-ov"] },
    { name: "Read comments / user info", tier: "basic", note: "Optional capabilities. Email access is a separate choice.", evidence: "inferred" },
  ],
  gotchas: [
    { text: "Access is per-page, chosen by the user at consent. New pages aren't visible to your agent unless shared.", evidence: "sourced", sources: ["notion-public"] },
    { text: "Installation scope is chosen at creation. 'Selected workspaces' connections can't be listed in the Marketplace.", evidence: "sourced", sources: ["notion-public"] },
    { text: "Terminology changed ('integrations' → 'connections'). Many tutorials use old UI names.", evidence: "sourced", sources: ["notion-ov"] },
    { text: "Notion's docs say the Authorization URL field populates after the public connection is 'submitted for review'. We couldn't confirm whether that means the creation form or the Marketplace review.", evidence: "inferred", sources: ["notion-auth"] },
  ],
  blockers: [
    {
      problem: "Agent says it can't find a page the user sees in Notion.",
      fix: "The page wasn't granted. Have the user re-run OAuth and select it, or share it with the connection via '…' → Connections.",
      evidence: "sourced",
      sources: ["notion-public", "notion-auth"],
    },
    {
      problem: "No Marketplace timeline from Notion.",
      fix: "Launch unlisted (any-workspace public connection works without listing) and treat Marketplace as distribution, not a gate.",
      evidence: "sourced",
      sources: ["notion-public"],
    },
  ],
  probes: [
    {
      label: "Authorize endpoint with a fake client_id",
      url: "https://api.notion.com/v1/oauth/authorize?client_id=probe_invalid&response_type=code&owner=user&redirect_uri=https://example.com/cb",
      status: 302,
      observed: "Redirect to app.notion.com/install-integration?…",
      meaning: "Endpoint confirmed. Notion validates the client inside its install UI, not at the HTTP layer.",
      at: CHECKED,
    },
    {
      label: "Token endpoint (GET)",
      url: "https://api.notion.com/v1/oauth/token",
      status: 400,
      observed: '{"code":"invalid_request_url"}',
      meaning: "Token endpoint exists and expects POST.",
      at: CHECKED,
    },
  ],
  sources: [
    src("notion-auth", "Notion — Authorization", "https://developers.notion.com/docs/authorization"),
    src("notion-public", "Notion — Public connections", "https://developers.notion.com/guides/get-started/public-integrations"),
    src("notion-ov", "Notion — Connections overview", "https://developers.notion.com/guides/get-started/overview"),
    src("n8n", "n8n docs — Notion credentials", "https://docs.n8n.io/integrations/builtin/credentials/notion", "third-party"),
    composioSource,
    probeSource,
  ],
  uncertainties: [
    "Notion publishes no Marketplace review timeline. 1–4 weeks is our guess.",
    "Privacy policy / terms requirement comes from third-party docs, not Notion's current pages.",
    "The Marketplace guidelines URL we tried returned 404, so the review criteria weren't read directly.",
  ],
};
