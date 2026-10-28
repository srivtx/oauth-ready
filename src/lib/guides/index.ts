import type { Guide } from "../types";
import { github } from "./github";
import { gmail } from "./gmail";
import { linkedin } from "./linkedin";
import { notion } from "./notion";
import { slack } from "./slack";

// Ordered easy → hard so the library reads as a spectrum.
export const CURATED: Guide[] = [github, notion, slack, linkedin, gmail];

const ALIASES: Record<string, string> = {
  google: "gmail",
  "google mail": "gmail",
  "gmail.com": "gmail",
  "github.com": "github",
  "slack.com": "slack",
  "notion.so": "notion",
  "notion.com": "notion",
  "linkedin.com": "linkedin",
};

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\.(com|io|so|dev|app|co|ai|org|net)$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function findCurated(query: string): Guide | undefined {
  const q = query.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const slug = ALIASES[q] ?? slugify(q);
  return CURATED.find((g) => g.slug === slug);
}
