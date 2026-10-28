import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";
import type { Guide } from "./types";
import { CURATED } from "./guides";

// Generated guides persist to Vercel Blob when BLOB_READ_WRITE_TOKEN is set
// (deployed), otherwise to ./data/generated on disk (local dev).
const DIR = path.join(process.cwd(), "data", "generated");
const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const blobKey = (slug: string) => `guides/${slug}.json`;

export async function saveGuide(guide: Guide): Promise<void> {
  const body = JSON.stringify(guide, null, 2);
  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    await put(blobKey(guide.slug), body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, `${guide.slug}.json`), body);
}

export async function loadGenerated(slug: string): Promise<Guide | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  try {
    if (blobEnabled()) {
      const { head } = await import("@vercel/blob");
      const meta = await head(blobKey(slug));
      const res = await fetch(meta.url, { cache: "no-store" });
      return res.ok ? ((await res.json()) as Guide) : null;
    }
    return JSON.parse(await fs.readFile(path.join(DIR, `${slug}.json`), "utf8")) as Guide;
  } catch {
    return null;
  }
}

export async function listGenerated(): Promise<Guide[]> {
  try {
    if (blobEnabled()) {
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: "guides/" });
      const guides = await Promise.all(
        blobs.map(async (b) => {
          const r = await fetch(b.url, { cache: "no-store" });
          return r.ok ? ((await r.json()) as Guide) : null;
        }),
      );
      return guides.filter((g): g is Guide => g !== null);
    }
    const files = await fs.readdir(DIR);
    const guides = await Promise.all(
      files.filter((f) => f.endsWith(".json")).map(async (f) => JSON.parse(await fs.readFile(path.join(DIR, f), "utf8")) as Guide),
    );
    return guides.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  } catch {
    return [];
  }
}

// Once per request: a guide page's metadata and body both ask for it, and each miss is a Blob round trip.
export const getGuide = cache(async (slug: string): Promise<Guide | null> => CURATED.find((g) => g.slug === slug) ?? (await loadGenerated(slug)));
