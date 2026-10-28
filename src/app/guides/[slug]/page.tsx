import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Difficulty, EvidenceTag, Md, OwnerTag, SectionTitle } from "@/components/bits";
import { AskGuide } from "@/components/AskGuide";
import { LogoTile, Mark } from "@/components/LogoTile";
import { ShareBar } from "@/components/ShareBar";
import { Steps } from "@/components/Steps";
import { Timeline } from "@/components/Timeline";
import { factsOf } from "@/lib/facts";
import { toMarkdown } from "@/lib/markdown";
import { getGuide } from "@/lib/store";
import type { Evidence, Guide } from "@/lib/types";

// Rendered per request: agent-generated guides live in Blob storage and appear after build.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = await getGuide((await params).slug);
  return g ? { title: `${g.name} OAuth guide — ${g.verdict.label} · OAuth Ready`, description: g.verdict.headline } : {};
}

export default async function GuidePage({ params }: Props) {
  const g = await getGuide((await params).slug);
  if (!g) notFound();
  return <GuideView g={g} />;
}

/** Starter questions that fit what this guide actually covers. */
function suggestionsFor(g: Guide): string[] {
  const out = ["How long until I can ship to production?"];
  if (g.scopes.some((s) => s.tier !== "basic")) out.push("Which scopes trigger a review, and how do I avoid them?");
  if (g.paths.length > 1) out.push("Which path should I take for an internal tool?");
  out.push("What can the agent do for me, and what must I do?");
  if (g.blockers.length) out.push("What usually gets apps rejected?");
  return out.slice(0, 4);
}

function evidenceMix(g: Guide) {
  const all = [...g.steps, ...g.requirements, ...g.scopes, ...g.gotchas, ...g.blockers, ...g.phases].map((c) => c.evidence);
  const count = (e: Evidence) => all.filter((x) => x === e).length;
  return { tested: count("tested") + g.probes.length, sourced: count("sourced"), inferred: count("inferred"), total: all.length + g.probes.length };
}

function GuideView({ g }: { g: Guide }) {
  const mix = evidenceMix(g);
  const owners = { agent: 0, you: 0, provider: 0 };
  g.steps.forEach((s) => owners[s.owner]++);
  const nav = [
    ["paths", "Paths"],
    ["timeline", "Timeline"],
    ["steps", "Steps"],
    ["requirements", "Requirements"],
    ["blockers", "Blockers"],
    ["evidence", "Evidence"],
  ];

  return (
    <main className="grid-bg">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link href="/#library" className="no-print font-mono text-xs text-faint hover:text-text">
          ← library
        </Link>

        {/* Dossier header */}
        <header className="mt-4 overflow-hidden border border-line bg-panel">
          <div className="grid sm:grid-cols-[220px_1fr]">
            <div className="relative">
              <LogoTile g={g} className="aspect-[16/9] h-full w-full sm:aspect-auto sm:min-h-[220px]" />
              <span className="tag-pixel absolute bottom-3 left-3">{g.verdict.label}</span>
            </div>
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-faint">
                <span>{g.category}</span>
                <span>·</span>
                <span className={g.origin === "curated" ? "text-tested" : "text-agent"}>
                  {g.origin === "curated" ? "curated + hand-verified" : `agent-generated · ${g.model ?? ""}`}
                </span>
                <span>·</span>
                <span>checked {g.generatedAt.slice(0, 10)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight sm:text-5xl">
                    <Mark g={g} size={30} />
                    {g.name}
                  </h1>
                  <a href={g.website} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted hover:text-text">
                    {g.website.replace(/^https?:\/\//, "")} ↗
                  </a>
                </div>
                <div className="sm:text-right">
                  <div className="mb-1.5 font-pixel text-[11px] text-faint">difficulty</div>
                  <Difficulty level={g.verdict.difficulty} />
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-line p-5 sm:p-7">
          <p className="max-w-3xl text-lg leading-relaxed sm:text-xl"><Md text={g.verdict.headline} /></p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Fact label="First working connection" value={g.timeToDev} />
            <Fact label="Production / approved" value={g.timeToProd} />
            <Fact
              label="Composio managed OAuth"
              value={g.managed.composio ? "Available: ship today" : g.managed.composio === false ? "Bring your own app" : "Unknown"}
              tone={g.managed.composio ? "good" : undefined}
              hint={g.managed.note}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-4">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="font-mono uppercase tracking-wider text-faint">who does it</span>
              <OwnerTag o="agent" /> {owners.agent}
              <OwnerTag o="you" /> {owners.you}
              <OwnerTag o="provider" /> {owners.provider}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="font-mono uppercase tracking-wider text-faint">evidence</span>
              <EvidenceTag e="tested" /> {mix.tested}
              <EvidenceTag e="sourced" /> {mix.sourced}
              <EvidenceTag e="inferred" /> {mix.inferred}
            </div>
          </div>
          {g.run && (
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border border-agent/20 bg-agent/5 px-3 py-2 font-mono text-[11px] text-muted">
              <span className="text-agent">◆ agent run</span>
              <span>{g.run.pagesRead} pages read</span>
              <span>
                {g.run.quotesVerified}/{g.run.claimsChecked} quotes verified verbatim
              </span>
              <span>{g.run.seconds}s</span>
              <span>${g.run.costUsd.toFixed(3)}</span>
              <span>{g.model}</span>
            </div>
          )}
          <div className="mt-4">
            <ShareBar markdown={toMarkdown(g, "{{URL}}")} slug={g.slug} name={g.name} canRegenerate={g.origin === "agent"} />
          </div>
          </div>
        </header>

        <div className="mt-8 grid gap-10 lg:grid-cols-[180px_1fr]">
          <aside className="no-print hidden lg:block">
            <nav className="sticky top-20 space-y-1 font-mono text-xs">
              {nav.map(([id, label], i) => (
                <a key={id} href={`#${id}`} className="block px-2 py-1 text-muted hover:bg-panel hover:text-text">
                  <span className="text-faint">0{i + 1}</span> {label}
                </a>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 space-y-14">
            {g.paths.length > 0 && (
              <section>
                <SectionTitle n="01" id="paths">Pick your path</SectionTitle>
                <div className="grid gap-3 md:grid-cols-2">
                  {g.paths.map((p, i) => (
                    <div key={i} className=" border border-line bg-panel p-4">
                      <div className="font-medium">{p.name}</div>
                      <div className="mt-1 text-sm text-muted">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-faint">when </span>
                        <Md text={p.when} />
                      </div>
                      <div className="mt-1 text-sm">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-accent">→ </span>
                        <Md text={p.outcome} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionTitle n="02" id="timeline">Time &amp; effort</SectionTitle>
              <Timeline phases={g.phases} />
              <Legend />
            </section>

            <section>
              <SectionTitle n="03" id="steps">Steps</SectionTitle>
              <Steps slug={g.slug} steps={g.steps} />
            </section>

            <section>
              <SectionTitle n="04" id="requirements">Requirements, scopes &amp; nuances</SectionTitle>
              <div className="grid gap-6 xl:grid-cols-2">
                <ClaimList title="You'll need" items={g.requirements} />
                <ClaimList title="Gotchas" items={g.gotchas} warn />
              </div>
              {g.scopes.length > 0 && (
                <div className="mt-6 overflow-x-auto border border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-panel-2 text-left font-mono text-[10px] uppercase tracking-wider text-faint">
                      <tr>
                        <th className="px-3 py-2">Scope / permission</th>
                        <th className="px-3 py-2">Tier</th>
                        <th className="px-3 py-2">Note</th>
                        <th className="px-3 py-2">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.scopes.map((s, i) => (
                        <tr key={i} className="border-t border-line align-top">
                          <td className="px-3 py-2 font-mono text-xs">{s.name}</td>
                          <td className="px-3 py-2">
                            <Tier t={s.tier} />
                          </td>
                          <td className="px-3 py-2 text-muted"><Md text={s.note} /></td>
                          <td className="px-3 py-2">
                            <EvidenceTag e={s.evidence} sources={s.sources} quote={s.quote} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <SectionTitle n="05" id="blockers">If you get blocked</SectionTitle>
              <div className="space-y-3">
                {g.blockers.map((b, i) => (
                  <div key={i} className=" border border-line bg-panel p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-danger">✕</span>
                      <span className="font-medium"><Md text={b.problem} /></span>
                      <EvidenceTag e={b.evidence} sources={b.sources} quote={b.quote} />
                    </div>
                    <p className="mt-1.5 pl-5 text-sm text-muted">
                      <span className="text-tested">→ </span>
                      <Md text={b.fix} />
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle n="06" id="evidence">Evidence: what was tested, sourced, and still uncertain</SectionTitle>
              {g.probes.length > 0 && (
                <div className="mb-6 overflow-hidden border border-line bg-[#07090b] font-mono text-xs">
                  <div className="border-b border-line px-3 py-2 text-faint">$ probes: live GETs with a dummy client_id, no credentials</div>
                  {g.probes.map((p, i) => (
                    <div key={i} className="border-b border-line/50 px-3 py-2 last:border-0">
                      <div className="text-tested">
                        ✓ {p.label} <span className="text-faint">→ {p.status ?? "n/a"}</span>
                      </div>
                      <div className="break-all text-faint">{p.url}</div>
                      <div className="text-muted">{p.observed}</div>
                      {p.meaning && <div className="text-agent">∴ {p.meaning}</div>}
                    </div>
                  ))}
                </div>
              )}
              <div className="grid gap-6 xl:grid-cols-2">
                <div>
                  <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-faint">Sources read</h3>
                  <ol className="space-y-1.5 text-sm">
                    {g.sources.map((s) => (
                      <li key={s.id} id={`src-${s.id}`} className="scroll-mt-24 target:bg-accent/10">
                        <span className="font-mono text-xs text-faint">[{s.id}]</span>{" "}
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {s.title}
                          </a>
                        ) : (
                          s.title
                        )}{" "}
                        <span className={`font-mono text-[10px] uppercase ${s.kind === "official" ? "text-sourced" : s.kind === "probe" ? "text-tested" : "text-you"}`}>
                          {s.kind}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-faint">Still uncertain</h3>
                  <ul className="space-y-1.5 text-sm text-muted">
                    {g.uncertainties.map((u, i) => (
                      <li key={i}>
                        <span className="text-you">? </span>
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      <AskGuide slug={g.slug} name={g.name.replace(/ \(.*\)$/, "")} facts={factsOf(g)} suggestions={suggestionsFor(g)} />
    </main>
  );
}

function Fact({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" }) {
  return (
    <div className=" border border-line bg-panel-2 px-4 py-3" title={hint}>
      <div className="font-mono text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className={`mt-1 text-sm font-medium ${tone === "good" ? "text-tested" : ""}`}>{value}</div>
      {hint && <div className="mt-1 text-xs leading-snug text-muted">{hint}</div>}
    </div>
  );
}

function ClaimList({ title, items, warn }: { title: string; items: Guide["requirements"]; warn?: boolean }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-faint">{title}</h3>
      <ul className="space-y-2.5 text-sm">
        {items.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span className={warn ? "text-you" : "text-accent"}>{warn ? "!" : "▸"}</span>
            <span>
              <Md text={c.text} /> <EvidenceTag e={c.evidence} sources={c.sources} quote={c.quote} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tier({ t }: { t: Guide["scopes"][number]["tier"] }) {
  const cls = { basic: "text-tested", sensitive: "text-you", restricted: "text-danger", gated: "text-provider" }[t] ?? "text-muted";
  return <span className={`font-mono text-[11px] uppercase ${cls}`}>{t}</span>;
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-wider text-faint">
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-agent" /> agent can do it</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-you" /> you</span>
      <span className="flex items-center gap-1.5"><span className="hatch h-2.5 w-2.5" /> waiting on provider</span>
      <span>bar widths ∝ √time, so short tasks stay visible</span>
    </div>
  );
}
