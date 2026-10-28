import type { Claim, Guide } from "./types";
import { fmtRange } from "./time";

const ev = (c: { evidence: string; sources?: string[] }) => ` _(${c.evidence}${c.sources?.length ? ` ${c.sources.map((s) => `[${s}]`).join("")}` : ""})_`;
const claims = (xs: Claim[]) => xs.map((c) => `- ${c.text}${ev(c)}`).join("\n");

/** Plain-markdown export so a guide can be pasted into a ticket, PR or doc. */
export function toMarkdown(g: Guide, url?: string): string {
  return [
    `# ${g.name}: OAuth app setup & approval guide`,
    `${url ? `Source: ${url} · ` : ""}${g.origin === "agent" ? `Agent-generated (${g.model})` : "Curated"} · ${g.generatedAt.slice(0, 10)}`,
    ``,
    `**Difficulty ${g.verdict.difficulty}/5: ${g.verdict.label}.** ${g.verdict.headline}`,
    ``,
    `- Time to first working connection: ${g.timeToDev}`,
    `- Time to production: ${g.timeToProd}`,
    `- Composio managed OAuth: ${g.managed.composio ? "available" : "not available"}. ${g.managed.note}`,
    ``,
    `## Choose your path`,
    ...g.paths.map((p) => `- **${p.name}**: ${p.when} → ${p.outcome}`),
    ``,
    `## Timeline`,
    ...g.phases.map((p) => `- [${p.milestone}] ${p.label}: ${p.kind === "wait" ? "wait " : ""}${fmtRange(p.min, p.max, p.unit)} (${p.owner})${ev(p)}`),
    ``,
    `## Steps`,
    ...g.steps.map((s, i) => `${i + 1}. [ ] **${s.title}** (${s.owner}, ${s.milestone})${ev(s)}\n   ${s.detail}${s.url ? `\n   ${s.url}` : ""}${s.artifact ? `\n\n   \`\`\`\n   ${s.artifact.content.replace(/\n/g, "\n   ")}\n   \`\`\`` : ""}`),
    ``,
    `## Requirements`,
    claims(g.requirements),
    ``,
    `## Scopes`,
    ...g.scopes.map((s) => `- \`${s.name}\` (${s.tier}): ${s.note}${ev(s)}`),
    ``,
    `## Gotchas`,
    claims(g.gotchas),
    ``,
    `## If you get blocked`,
    ...g.blockers.map((b) => `- **${b.problem}** → ${b.fix}${ev(b)}`),
    ``,
    `## What the agent tested`,
    ...g.probes.map((p) => `- ${p.label}: \`${p.url}\` → ${p.status ?? "n/a"}, ${p.observed}${p.meaning ? `. ${p.meaning}` : ""}`),
    ``,
    `## Still uncertain`,
    ...g.uncertainties.map((u) => `- ${u}`),
    ``,
    `## Sources`,
    ...g.sources.filter((s) => s.url).map((s) => `- [${s.id}] ${s.title} (${s.kind}): ${s.url} (accessed ${s.accessed})`),
    ``,
    `_Evidence: tested = observed by a live probe; sourced = stated in a cited source; inferred = judgement/estimate._`,
  ].join("\n");
}
