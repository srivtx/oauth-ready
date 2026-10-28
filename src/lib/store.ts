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
    listed = null;
    return;
  }
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, `${guide.slug}.json`), body);
  listed = null;
}

// Storage calls occasionally stall for many seconds; never let one hold up a page.
const timed = <T,>(p: Promise<T>, ms = 8000): Promise<T> =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("storage timeout")), ms))]);

// A stored guide only changes when it's re-saved, which gives it a new upload time. Keep each
// one's parsed JSON per server instance under that time, so pages only download what changed.
const fetched = new Map<string, { at: number; guide: Promise<Guide | null> }>();
function fetchGuide(url: string, uploadedAt: Date): Promise<Guide | null> {
  const at = uploadedAt.getTime();
  const hit = fetched.get(url);
  if (hit && hit.at === at) return hit.guide;
  // The version in the query also skips a CDN copy of the file from before it was re-saved, and
  // makes the URL immutable, so it's safe to keep in Next's data cache across requests.
  const guide = timed(
    fetch(`${url}?v=${at}`, { cache: "force-cache" })
      .then((r) => (r.ok ? r : fetch(url, { next: { revalidate: 60 } })))
      .then((r) => (r.ok ? (r.json() as Promise<Guide>) : null)),
  )
    .catch(() => null)
    .then((g) => {
      if (!g && fetched.get(url)?.at === at) fetched.delete(url); // don't remember a failure
      return g;
    });
  fetched.set(url, { at, guide });
  return guide;
}

export async function loadGenerated(slug: string): Promise<Guide | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  try {
    if (blobEnabled()) {
      const { head } = await import("@vercel/blob");
      const meta = await head(blobKey(slug), { abortSignal: AbortSignal.timeout(8000) });
      return await fetchGuide(meta.url, meta.uploadedAt);
    }
    return JSON.parse(await fs.readFile(path.join(DIR, `${slug}.json`), "utf8")) as Guide;
  } catch {
    return null;
  }
}

// /ask, /compare and /chat read the whole library on every message: share one listing per server
// instance for a little while. Saving a guide here clears it.
let listed: { at: number; guides: Promise<Guide[]> } | null = null;
const LIST_TTL = 30_000;

export function listGenerated(): Promise<Guide[]> {
  if (listed && Date.now() - listed.at < LIST_TTL) return listed.guides;
  const guides = listFresh();
  listed = { at: Date.now(), guides };
  // An empty result may be a storage hiccup: don't keep it.
  guides.then((g) => {
    if (!g.length && listed?.guides === guides) listed = null;
  });
  return guides;
}

async function listFresh(): Promise<Guide[]> {
  try {
    if (blobEnabled()) {
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: "guides/", abortSignal: AbortSignal.timeout(8000) });
      const guides = await Promise.all(blobs.map((b) => fetchGuide(b.url, b.uploadedAt)));
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
