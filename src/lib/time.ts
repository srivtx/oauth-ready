import type { Phase } from "./types";

const HOURS: Record<Phase["unit"], number> = { minutes: 1 / 60, hours: 1, days: 24, weeks: 168 };

export const toHours = (n: number, unit: Phase["unit"]) => n * HOURS[unit];

export function fmtRange(min: number, max: number, unit: Phase["unit"]): string {
  const u = min === 1 && max === 1 ? unit.replace(/s$/, "") : unit;
  if (max === 0) return "none";
  return min === max ? `${max} ${u}` : `${min}–${max} ${u}`;
}

export function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${Math.round(h * 10) / 10} h`;
  const n = h < 24 * 14 ? Math.round(h / 24) : Math.round(h / 168);
  return `${n} ${h < 24 * 14 ? "day" : "week"}${n === 1 ? "" : "s"}`;
}

export function fmtWork(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h <= 10) return `${Math.round(h * 10) / 10} h`;
  return `~${Math.round(h / 8)} workdays`;
}

// Hands-on work is counted in working hours (8h days, 40h weeks); waits in calendar time.
const WORK_HOURS: Record<Phase["unit"], number> = { minutes: 1 / 60, hours: 1, days: 8, weeks: 40 };

/** Split totals into hands-on work vs waiting. */
export function totals(phases: Phase[]) {
  const sum = (f: (p: Phase) => boolean, k: "min" | "max") =>
    phases.filter(f).reduce((a, p) => a + (p.kind === "work" ? p[k] * WORK_HOURS[p.unit] : toHours(p[k], p.unit)), 0);
  return {
    workMin: sum((p) => p.kind === "work", "min"),
    workMax: sum((p) => p.kind === "work", "max"),
    waitMin: sum((p) => p.kind === "wait", "min"),
    waitMax: sum((p) => p.kind === "wait", "max"),
  };
}
