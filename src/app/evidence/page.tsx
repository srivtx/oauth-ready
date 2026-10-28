import { LogoTile, Mark } from "@/components/LogoTile";
import { PixelScatter } from "@/components/pixel";
import { PixelIcon, type IconName } from "@/components/PixelIcon";
import { CURATED } from "@/lib/guides";
import { CHECKS, type Check } from "@/lib/data/verification";
import type { Guide } from "@/lib/types";

export const metadata = { title: "Verification log · OAuth Ready" };

const ORDER: Check["outcome"][] = ["corrected", "confirmed", "unverified"];

const OUTCOME: Record<Check["outcome"], { label: string; icon: IconName; text: string; bg: string; border: string; blurb: string }> = {
  corrected: {
    label: "Corrected",
    icon: "cross",
    text: "text-you",
    bg: "bg-you",
    border: "border-l-you",
    blurb: "What we believed was wrong or stale. The guides use what the source says.",
  },
  confirmed: {
    label: "Confirmed",
    icon: "tick",
    text: "text-tested",
    bg: "bg-tested",
    border: "border-l-tested",
    blurb: "Matches the provider's own docs or a live probe.",
  },
  unverified: {
    label: "Still open",
    icon: "ask",
    text: "text-inferred",
    bg: "bg-inferred",
    border: "border-l-inferred",
    blurb: "No primary source. The guides label these as estimates.",
  },
};

const METHOD: Record<Check["how"], { label: string; icon: IconName }> = {
  doc: { label: "read the primary doc", icon: "doc" },
  probe: { label: "live HTTP probe", icon: "probe" },
  attempt: { label: "tried it ourselves", icon: "flask" },
};

/** Which curated providers a check is about ("All five", "GitHub · Slack", ...). Empty = our own agent. */
function providersOf(c: Check): Guide[] {
  if (/^all/i.test(c.app)) return CURATED;
  const names = c.app.split("·").map((s) => s.trim().toLowerCase());
  return CURATED.filter((g) => names.includes(g.slug) || names.includes(g.name.toLowerCase()));
}

function host(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    const tail = path.split("/").filter(Boolean).slice(-2).join("/");
    return { host: u.hostname.replace(/^www\./, ""), tail: tail ? `/…/${tail}` : "" };
  } catch {
    return { host: url, tail: "" };
  }
}

const byOutcome = (a: Check, b: Check) => ORDER.indexOf(a.outcome) - ORDER.indexOf(b.outcome);

export default function EvidencePage() {
  const count = (o: Check["outcome"]) => CHECKS.filter((c) => c.outcome === o).length;
  const groups: { key: string; title: string; sub: string; guides: Guide[]; checks: Check[] }[] = [
    ...CURATED.map((g) => ({
      key: g.slug,
      title: g.name,
      sub: g.category,
      guides: [g],
      checks: CHECKS.filter((c) => {
        const p = providersOf(c);
        return p.length === 1 && p[0].slug === g.slug;
      }),
    })),
    {
      key: "across",
      title: "Across providers",
      sub: "claims that cover several apps at once",
      guides: [],
      checks: CHECKS.filter((c) => providersOf(c).length > 1),
    },
    {
      key: "agent",
      title: "Building the agent",
      sub: "what broke while we built the live agent, and what we changed",
      guides: [],
      checks: CHECKS.filter((c) => providersOf(c).length === 0),
    },
  ].filter((x) => x.checks.length);

  return (
    <main>
      {/* Header band */}
      <section className="field grain relative overflow-hidden">
        <PixelScatter seed="evidence" className="opacity-60" />
        <div className="relative mx-auto max-w-5xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14">
          <span className="tag-pixel">verification log · checked 2026-10-28</span>
          <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">We checked our own claims. Here&apos;s what was wrong.</h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/90">
            We started the five curated guides from memory, search summaries and third-party posts. Then we checked {CHECKS.length} of those claims against each
            provider&apos;s own docs (fetched and read) or a live HTTP probe. The mistakes we found are why the live agent now reads every source itself and checks every link it
            cites.
          </p>

          {/* One block per check, coloured by outcome */}
          <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-6">
            {ORDER.map((o) => (
              <a key={o} href={`#${o}-legend`} className="group">
                <div className="flex gap-[3px]">
                  {Array.from({ length: count(o) }, (_, i) => (
                    <span key={i} className={`h-3 w-3 ${o === "corrected" ? "bg-[#ffd08a]" : o === "confirmed" ? "bg-[#f4fff6]" : "border border-white/70"}`} />
                  ))}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-pixel text-4xl leading-none">{count(o)}</span>
                  <span className="font-mono text-xs text-white/85 group-hover:underline">{OUTCOME[o].label.toLowerCase()}</span>
                </div>
              </a>
            ))}
          </div>

          {/* Who we checked */}
          <div className="mt-8 flex flex-wrap items-center gap-2 font-mono text-[11px] text-white/80">
            <span className="mr-1">sources from</span>
            {CURATED.map((g) => (
              <a key={g.slug} href={`#${g.slug}`} className="flex items-center gap-1.5 border border-white/30 bg-black/20 px-2 py-1 hover:border-white">
                <Mark g={g} size={12} />
                {g.name}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Legend */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-5xl gap-4 px-4 py-5 sm:grid-cols-2 sm:px-6">
          <div className="space-y-2">
            {ORDER.map((o) => (
              <div key={o} id={`${o}-legend`} className="flex items-start gap-3 text-sm">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center text-[#13221a] ${OUTCOME[o].bg}`}>
                  <PixelIcon name={OUTCOME[o].icon} size={14} accent="#13221a" />
                </span>
                <span>
                  <span className={`font-mono ${OUTCOME[o].text}`}>{OUTCOME[o].label.toLowerCase()}</span>
                  <span className="text-muted">: {OUTCOME[o].blurb}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {(Object.keys(METHOD) as Check["how"][]).map((m) => (
              <div key={m} className="flex items-center gap-3 text-sm text-muted">
                <PixelIcon name={METHOD[m].icon} size={18} className="text-text" />
                {METHOD[m].label}
                <span className="font-mono text-[11px] text-faint">· {CHECKS.filter((c) => c.how === m).length} checks</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid-bg">
        <div className="mx-auto max-w-5xl space-y-12 px-4 py-12 sm:px-6">
          {groups.map((grp) => (
            <section key={grp.key} id={grp.key} className="scroll-mt-20">
              <div className="mb-4 flex items-center gap-4">
                {grp.guides.length === 1 ? (
                  <LogoTile g={grp.guides[0]} className="h-14 w-14 shrink-0" />
                ) : grp.key === "across" ? (
                  <span className="flex h-14 w-14 shrink-0 flex-wrap content-center items-center justify-center gap-1 border border-line bg-panel p-1.5">
                    {CURATED.map((g) => (
                      <Mark key={g.slug} g={g} size={12} />
                    ))}
                  </span>
                ) : (
                  <span aria-hidden className="grain flex h-14 w-14 shrink-0 items-center justify-center bg-field">
                    <span className="grid grid-cols-2 gap-[3px]">
                      <span className="h-3 w-3 bg-accent" />
                      <span className="h-3 w-3" />
                      <span className="h-3 w-3 bg-[#13221a]" />
                      <span className="h-3 w-3 bg-accent" />
                    </span>
                  </span>
                )}
                <div className="min-w-0">
                  <h2 className="font-pixel text-lg leading-tight">{grp.title}</h2>
                  <div className="mt-1 font-mono text-[11px] text-faint">{grp.sub}</div>
                </div>
                <div className="ml-auto hidden gap-[3px] sm:flex" aria-label={`${grp.checks.length} checks`}>
                  {[...grp.checks].sort(byOutcome).map((c, i) => (
                    <span key={i} title={OUTCOME[c.outcome].label} className={`h-2.5 w-2.5 ${c.outcome === "unverified" ? "border border-inferred" : OUTCOME[c.outcome].bg}`} />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {[...grp.checks].sort(byOutcome).map((c, i) => (
                  <Row key={i} c={c} showApps={grp.key === "across"} />
                ))}
              </div>
            </section>
          ))}

          <p className="border-t border-line pt-6 font-mono text-[11px] leading-relaxed text-faint">
            Not yet verified by anyone: the click-by-click console steps. That needs signed-in provider accounts, which the agent deliberately never creates. A human
            click-through is the next check before a guide gets a verified stamp.
          </p>
        </div>
      </div>
    </main>
  );
}

function Row({ c, showApps }: { c: Check; showApps: boolean }) {
  const o = OUTCOME[c.outcome];
  const m = METHOD[c.how];
  const src = c.url ? host(c.url) : null;
  return (
    <article className={`group border border-l-4 border-line bg-panel ${o.border}`}>
      <div className="grid gap-x-4 gap-y-3 p-4 sm:grid-cols-[110px_1fr]">
        <div className="flex items-center gap-2 sm:flex-col sm:items-start">
          <span className={`flex items-center gap-1.5 px-1.5 py-1 font-pixel text-[10px] text-[#13221a] ${o.bg}`}>
            <PixelIcon name={o.icon} size={11} accent="#13221a" />
            {o.label}
          </span>
          {showApps && <span className="font-mono text-[10px] text-faint">{c.app}</span>}
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex gap-3 text-sm">
            <span className="w-16 shrink-0 pt-0.5 font-mono text-[10px] uppercase tracking-wider text-faint">believed</span>
            <span className={c.outcome === "corrected" ? "text-muted line-through decoration-you/60" : "text-muted"}>{c.claim}</span>
          </div>
          <div className="flex gap-3 text-sm">
            <span className={`w-16 shrink-0 pt-0.5 font-mono text-[10px] uppercase tracking-wider ${o.text}`}>{c.outcome === "unverified" ? "status" : "found"}</span>
            <span className="leading-relaxed text-text">{c.finding}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 font-mono text-[11px] text-faint">
        <span className="flex items-center gap-1.5">
          <PixelIcon name={m.icon} size={12} className="text-muted" />
          {m.label}
        </span>
        {src && c.url && (
          <a href={c.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-sourced hover:underline">
            <span className="text-text">{src.host}</span>
            <span className="truncate">{src.tail}</span>
            <span aria-hidden>↗</span>
          </a>
        )}
        <span className="ml-auto">2026-10-28</span>
      </div>
    </article>
  );
}
