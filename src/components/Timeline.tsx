import type { Phase } from "@/lib/types";
import { fmtHours, fmtRange, fmtWork, toHours, totals } from "@/lib/time";
import { EvidenceTag } from "./bits";

const COLOR = { agent: "bg-agent", you: "bg-you", provider: "hatch" } as const;

// Widths use sqrt(hours) so a 15-minute task stays visible next to a 10-week wait,
// while the wait still clearly dominates — which is the point.
export function Timeline({ phases }: { phases: Phase[] }) {
  if (!phases.length) return null;
  const weight = (p: Phase) => Math.sqrt(Math.max(toHours(p.max, p.unit), 0.15));
  const total = phases.reduce((a, p) => a + weight(p), 0);
  const firstProd = phases.findIndex((p) => p.milestone === "prod");
  const t = totals(phases);

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Hands-on work" value={`${fmtWork(t.workMin)} – ${fmtWork(t.workMax)}`} />
        <Stat label="Waiting on others" value={t.waitMax ? `${t.waitMin ? fmtHours(t.waitMin) : "0"} – ${fmtHours(t.waitMax)}` : "none"} accent={t.waitMax > 72} />
        <Stat label="You're actually working" value={workShare(t.workMax, t.waitMax)} />
        <Stat label="Phases" value={`${phases.length}`} />
      </div>

      <div className="relative flex h-10 w-full overflow-hidden border border-line">
        {phases.map((p, i) => (
          <div
            key={i}
            title={`${p.label} · ${fmtRange(p.min, p.max, p.unit)}`}
            style={{ width: `${(weight(p) / total) * 100}%` }}
            className={`${COLOR[p.owner] ?? "bg-you"} ${p.kind === "work" ? "opacity-85" : ""} relative border-r border-bg last:border-r-0`}
          >
            {i === firstProd && <span className="absolute -left-px top-0 h-full w-0.5 bg-text" />}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-wider text-faint">
        <span>start</span>
        {firstProd > 0 && <span>↑ first working connection, then production path</span>}
        <span>production</span>
      </div>

      <ol className="mt-5 space-y-2">
        {phases.map((p, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/60 pb-2 text-sm">
            <span className={`h-3 w-3 shrink-0 ${COLOR[p.owner] ?? "bg-you"}`} />
            <span className="font-mono text-xs text-faint">{p.milestone === "dev" ? "DEV" : "PROD"}</span>
            <span className="min-w-0 flex-1">{p.label}</span>
            <span className="font-mono text-xs text-muted">
              {p.kind === "wait" ? "wait " : ""}
              {fmtRange(p.min, p.max, p.unit)}
            </span>
            <EvidenceTag e={p.evidence} sources={p.sources} />
            {p.note && <span className="w-full pl-6 text-xs text-muted">{p.note}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function workShare(work: number, wait: number): string {
  const pct = (work / Math.max(work + wait, 0.01)) * 100;
  return pct >= 99.5 ? "all of it" : pct < 1 ? "<1% of elapsed time" : `${Math.round(pct)}% of elapsed time`;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className=" border border-line bg-panel px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className={`mt-0.5 text-sm font-medium ${accent ? "text-provider" : ""}`}>{value}</div>
    </div>
  );
}
