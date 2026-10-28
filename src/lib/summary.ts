// The small, serialisable slice of a guide that client components (search commands, the
// wait chart) need, so whole guides never ship to the browser.

import { totals, toHours } from "./time";
import type { Guide } from "./types";

export interface AppSummary {
  slug: string;
  name: string;
  origin: Guide["origin"];
  difficulty: Guide["verdict"]["difficulty"];
  label: string;
  timeToDev: string;
  timeToProd: string;
  managed: boolean | null;
  /** Elapsed hours to a first working connection, and to production (min–max). */
  dev: [number, number];
  prod: [number, number];
  /** Hands-on work vs waiting, max hours, for the chart's detail line. */
  work: number;
  wait: number;
  inferredShare: number;
}

const elapsed = (g: Guide, k: "min" | "max", milestone?: "dev") =>
  g.phases.filter((p) => !milestone || p.milestone === milestone).reduce((a, p) => a + toHours(p[k], p.unit), 0);

export function summarize(g: Guide): AppSummary {
  const t = totals(g.phases);
  return {
    slug: g.slug,
    name: g.name,
    origin: g.origin,
    difficulty: g.verdict.difficulty,
    label: g.verdict.label,
    timeToDev: g.timeToDev,
    timeToProd: g.timeToProd,
    managed: g.managed.composio,
    dev: [elapsed(g, "min", "dev"), elapsed(g, "max", "dev")],
    prod: [elapsed(g, "min"), elapsed(g, "max")],
    work: t.workMax,
    wait: t.waitMax,
    inferredShare: g.phases.length ? g.phases.filter((p) => p.evidence === "inferred").length / g.phases.length : 0,
  };
}
