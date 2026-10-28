// A guide flattened into numbered facts, so a chat answer can cite exactly what it relies on
// ([R2], [X1]) and the UI can show each citation's evidence level and quote.

import type { Evidence, Guide } from "./types";

export interface Fact {
  id: string;
  text: string;
  evidence: Evidence | "path" | "guide";
  quote?: string;
  sources?: string[];
  /** Library-wide facts point at the guide they summarise. */
  href?: string;
}

export function factsOf(g: Guide): Fact[] {
  const out: Fact[] = [];
  const add = (prefix: string, items: { text: string; evidence: Fact["evidence"]; quote?: string; sources?: string[] }[]) =>
    items.forEach((x, i) => out.push({ id: `${prefix}${i + 1}`, ...x }));
  add("P", g.paths.map((p) => ({ text: `Path "${p.name}": ${p.when} → ${p.outcome}`, evidence: "path" as const })));
  add("W", g.phases.map((p) => ({ text: `${p.label}: ${p.min}–${p.max} ${p.unit} (${p.kind}, ${p.owner}, until ${p.milestone})${p.note ? `. ${p.note}` : ""}`, evidence: p.evidence, sources: p.sources })));
  add("T", g.steps.map((s) => ({ text: `Step "${s.title}" (${s.owner}, ${s.milestone}): ${s.detail}${s.url ? ` (${s.url})` : ""}`, evidence: s.evidence, quote: s.quote, sources: s.sources })));
  add("R", g.requirements.map((c) => ({ text: c.text, evidence: c.evidence, quote: c.quote, sources: c.sources })));
  add("S", g.scopes.map((s) => ({ text: `Scope ${s.name} [${s.tier}]: ${s.note}`, evidence: s.evidence, quote: s.quote, sources: s.sources })));
  add("G", g.gotchas.map((c) => ({ text: c.text, evidence: c.evidence, quote: c.quote, sources: c.sources })));
  add("B", g.blockers.map((b) => ({ text: `If ${b.problem} → ${b.fix}`, evidence: b.evidence, quote: b.quote, sources: b.sources })));
  add("X", g.probes.map((p) => ({ text: `Probe ${p.label}: GET ${p.url} → ${p.status ?? "no response"}. ${p.observed} Meaning: ${p.meaning}`, evidence: "tested" as const })));
  return out;
}

export function factSheet(g: Guide): string {
  const facts = factsOf(g)
    .map((f) => `[${f.id}] (${f.evidence}${f.sources?.length ? `; ${f.sources.join(",")}` : ""}) ${f.text}`)
    .join("\n");
  const sources = g.sources.map((s) => `${s.id}: ${s.title} <${s.url}>`).join("\n");
  return `APP: ${g.name} (${g.website})
VERDICT: ${g.verdict.label}, difficulty ${g.verdict.difficulty}/5. ${g.verdict.headline}
TIME TO FIRST CONNECTION: ${g.timeToDev}
TIME TO PRODUCTION: ${g.timeToProd}
COMPOSIO MANAGED APP: ${g.managed.composio === null ? "unknown" : g.managed.composio ? "yes" : "no"}. ${g.managed.note}

FACTS
${facts}

SOURCES
${sources}`;
}

/** One fact per guide, for questions across the library ("which is fastest?", "who needs a security review?"). */
export function libraryFacts(guides: Guide[]): Fact[] {
  return guides.map((g, i) => ({
    id: `L${i + 1}`,
    evidence: "guide" as const,
    href: `/guides/${g.slug}`,
    text: [
      `${g.name} (${g.origin === "curated" ? "hand-verified" : "agent-generated"} guide): ${g.verdict.label}, difficulty ${g.verdict.difficulty}/5. ${g.verdict.headline}`,
      `First connection: ${g.timeToDev}. Production: ${g.timeToProd}.`,
      `Composio managed app: ${g.managed.composio === null ? "unknown" : g.managed.composio ? "yes" : "no"}.`,
      g.paths.length ? `Paths: ${g.paths.map((p) => `${p.name} (${p.when})`).join("; ")}.` : "",
      g.gotchas.length ? `Watch out: ${g.gotchas.slice(0, 2).map((c) => c.text).join(" ")}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  }));
}

export function librarySheet(guides: Guide[]): string {
  return `LIBRARY (${guides.length} guides)\n${libraryFacts(guides)
    .map((f) => `[${f.id}] ${f.text}`)
    .join("\n")}`;
}
