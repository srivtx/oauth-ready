// The guide schema. Curated guides and agent-generated guides share it, so the
// same renderer and the same evidence rules apply to both.

/**
 * tested   – observed directly (an HTTP probe the agent ran, or a manual attempt)
 * sourced  – stated by a fetched source; the source id is attached
 * inferred – model judgement or third-party hearsay; treat as a lead, not a fact
 */
export type Evidence = "tested" | "sourced" | "inferred";

/** Who acts: the agent can do it for you, you must do it, or you wait on the provider. */
export type Owner = "agent" | "you" | "provider";

export type Milestone = "dev" | "prod";

export interface Source {
  id: string;
  title: string;
  url: string;
  kind: "official" | "third-party" | "probe";
  accessed: string; // ISO date
}

export interface Claim {
  text: string;
  evidence: Evidence;
  sources?: string[];
  /** Verbatim sentence from the cited source, checked by code to appear in it. */
  quote?: string;
}

export interface Phase {
  label: string;
  kind: "work" | "wait";
  owner: Owner;
  min: number;
  max: number;
  unit: "minutes" | "hours" | "days" | "weeks";
  milestone: Milestone;
  evidence: Evidence;
  sources?: string[];
  note?: string;
}

export interface Artifact {
  label: string;
  kind: "link" | "code" | "text";
  content: string;
}

export interface Step {
  title: string;
  owner: Owner;
  milestone: Milestone;
  detail: string;
  url?: string;
  evidence: Evidence;
  sources?: string[];
  quote?: string;
  artifact?: Artifact;
}

export interface Scope {
  name: string;
  tier: "basic" | "sensitive" | "restricted" | "gated";
  note: string;
  evidence: Evidence;
  sources?: string[];
  quote?: string;
}

export interface Blocker {
  problem: string;
  fix: string;
  evidence: Evidence;
  sources?: string[];
  quote?: string;
}

export interface Path {
  name: string;
  when: string;
  outcome: string;
}

export interface Probe {
  label: string;
  url: string;
  status: number | null;
  observed: string;
  meaning: string;
  at: string;
}

export interface VerificationItem {
  claim: string;
  outcome: "confirmed" | "corrected" | "unverified";
  detail: string;
  sources?: string[];
}

export interface Guide {
  slug: string;
  name: string;
  website: string;
  category: string;
  origin: "curated" | "agent";
  generatedAt: string;
  model?: string;
  /** Logo as a same-origin path or data: URI, and brand colour (agent guides capture these). */
  logo?: string;
  brandColor?: string;
  /** What generating this guide cost and how long it took (agent guides). */
  run?: { costUsd: number; tokens: number; seconds: number; pagesRead: number; quotesVerified: number; claimsChecked: number };
  verdict: {
    difficulty: 1 | 2 | 3 | 4 | 5;
    label: string; // e.g. "Self-serve", "Review gate", "Partner-gated"
    headline: string; // one sentence a developer can act on
  };
  timeToDev: string;
  timeToProd: string;
  managed: { composio: boolean | null; note: string };
  paths: Path[];
  phases: Phase[];
  steps: Step[];
  requirements: Claim[];
  scopes: Scope[];
  gotchas: Claim[];
  blockers: Blocker[];
  probes: Probe[];
  sources: Source[];
  uncertainties: string[];
  verification?: { checkedAt: string; items: VerificationItem[] };
}

/**
 * Events streamed from the live agent to the browser (NDJSON).
 * `tool` rows are upserted by id, so a row can go run → ok/warn/err.
 */
export type AgentEvent =
  | { type: "step"; id: string; label: string }
  | { type: "identified"; name: string; slug: string; website: string; logo?: string; brandColor?: string }
  | { type: "tool"; id: string; name: string; arg: string; status: "run" | "ok" | "warn" | "err"; result?: string; url?: string }
  | { type: "status"; verb: string }
  | { type: "thinking"; text: string }
  | { type: "usage"; tokens: number; costUsd: number; model?: string }
  | { type: "log"; level: "info" | "ok" | "warn" | "err"; text: string; url?: string }
  | { type: "sourceUse"; url: string; claims: number; verified: number }
  | { type: "done"; slug: string; guide: Guide }
  | { type: "error"; message: string };
