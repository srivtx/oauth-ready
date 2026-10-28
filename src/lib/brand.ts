// Real provider marks (Simple Icons 13.21.0, CC0 icon data; trademarks belong to their owners
// and are used only to identify each service). Agent guides carry their own logo (favicon or
// Simple Icons hit) captured at generation time.

import type { Guide } from "./types";

export const BRANDS: Record<string, { logo: string; color: string }> = {
  github: { logo: "/logos/github.svg", color: "#181717" },
  notion: { logo: "/logos/notion.svg", color: "#000000" },
  slack: { logo: "/logos/slack.svg", color: "#4A154B" },
  linkedin: { logo: "/logos/linkedin.svg", color: "#0A66C2" },
  gmail: { logo: "/logos/gmail.svg", color: "#EA4335" },
  zoom: { logo: "/logos/zoom.svg", color: "#0B5CFF" },
  hubspot: { logo: "/logos/hubspot.svg", color: "#FF7A59" },
  dropbox: { logo: "/logos/dropbox.svg", color: "#0061FF" },
  calendly: { logo: "/logos/calendly.svg", color: "#006BFF" },
};

const FALLBACK = ["#2e9a5d", "#7a5cc7", "#d4568f", "#2f7fd1", "#c7782f", "#3a9d8f"];

export function hashColor(s: string): string {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

export function brandOf(g: Pick<Guide, "slug" | "logo" | "brandColor">): { logo: string | null; color: string } {
  const known = BRANDS[g.slug];
  return {
    logo: g.logo ?? known?.logo ?? null,
    color: g.brandColor ?? known?.color ?? hashColor(g.slug),
  };
}

/** Very dark brand colours (GitHub, Notion) read as black on our base, so tiles use field green instead. */
export function tileColor(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.09 ? "#2e9a5d" : hex;
}
