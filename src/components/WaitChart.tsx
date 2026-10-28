"use client";

import Link from "next/link";
import { useState } from "react";
import type { AppSummary } from "@/lib/summary";
import { fmtHours } from "@/lib/time";

// Elapsed time to production for every guide on one log axis, so "an hour or eight weeks?"
// is answered across the library at a glance. Bars run from each guide's fastest to slowest
// case; the white tick is when you'd have a first working connection.

const LO = 0.25;
const HI = 4000;
const TICKS: [number, string, string][] = [
  [1, "1 hour", "1h"],
  [24, "1 day", "1d"],
  [168, "1 week", "1w"],
  [720, "1 month", "1mo"],
  [2160, "3 months", "3mo"],
];
const x = (h: number) => (Math.log(Math.min(Math.max(h, LO), HI) / LO) / Math.log(HI / LO)) * 100;
const span = ([a, b]: [number, number]) => (fmtHours(a) === fmtHours(b) ? fmtHours(b) : `${fmtHours(a)} – ${fmtHours(b)}`);

export function WaitChart({ apps }: { apps: AppSummary[] }) {
  const rows = [...apps].sort((a, b) => a.prod[1] - b.prod[1] || a.prod[0] - b.prod[0]);
  const [hover, setHover] = useState<AppSummary | null>(null);
  const shown = hover ?? rows[rows.length - 1];

  return (
    <div className="border border-line bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-5 bg-accent" />
          to production, fastest → slowest case
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-text" />
          first working connection
        </span>
      </div>

      <div className="relative mt-4">
        {/* Gridlines + axis labels, offset past the name column */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[104px] right-0 sm:left-[150px] sm:right-[150px]">
          {TICKS.map(([h, l, short]) => (
            <div key={h} className="absolute inset-y-0 border-l border-dashed border-line" style={{ left: `${x(h)}%` }}>
              <span className="absolute -bottom-5 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-faint">
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{l}</span>
              </span>
            </div>
          ))}
        </div>

        <ul onMouseLeave={() => setHover(null)}>
          {rows.map((a) => {
            const on = shown.slug === a.slug;
            return (
              <li key={a.slug}>
                <Link
                  href={`/guides/${a.slug}`}
                  onMouseEnter={() => setHover(a)}
                  onFocus={() => setHover(a)}
                  className={`relative flex h-7 items-center ${on ? "bg-white/[0.04]" : ""}`}
                >
                  <span className={`w-[104px] shrink-0 truncate pr-3 text-[13px] sm:w-[150px] ${on ? "text-text" : "text-muted"}`}>
                    {a.name}
                    {a.origin === "agent" && <span className="ml-1.5 font-pixel text-[8px] text-agent">agent</span>}
                  </span>
                  <span className="relative h-full flex-1">
                    <span
                      className={`absolute top-1/2 h-2 -translate-y-1/2 transition-opacity ${on ? "bg-accent" : "bg-accent/55"}`}
                      style={{ left: `${x(a.prod[0])}%`, width: `max(3px, ${x(a.prod[1]) - x(a.prod[0])}%)` }}
                    />
                    <span className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 bg-text ring-2 ring-panel" style={{ left: `${x(a.dev[1])}%` }} />
                  </span>
                  <span className={`hidden w-[150px] shrink-0 pl-3 text-right font-mono text-[11px] sm:block ${on ? "text-text" : "text-faint"}`}>{span(a.prod)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Detail for the hovered row (defaults to the slowest) */}
      <div className="mt-9 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 font-mono text-[11px] text-muted">
        <span className="text-text">{shown.name}</span>
        <span>production in {span(shown.prod)}</span>
        <span>first connection by {fmtHours(shown.dev[1])}</span>
        <span>
          waiting on the provider: <span className="text-text">{shown.wait ? `up to ${fmtHours(shown.wait)}` : "none"}</span>
        </span>
        {shown.inferredShare > 0 && <span className="text-inferred">{Math.round(shown.inferredShare * 100)}% of phase timings inferred</span>}
      </div>
    </div>
  );
}
