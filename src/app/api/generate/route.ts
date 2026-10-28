import { runAgent } from "@/lib/agent/run";
import { PROVIDERS } from "@/lib/agent/providers";
import type { ByoKey } from "@/lib/agent/llm";
import { findCurated, slugify } from "@/lib/guides";
import { loadGenerated, saveGuide } from "@/lib/store";
import type { AgentEvent } from "@/lib/types";
import { ipOf, limiter } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CACHE_DAYS = 7;
// Fresh generations on the site's own key are rate-limited per IP (best-effort,
// per server instance). Cached guides and bring-your-own-key runs are not.
const LIMIT = Number(process.env.GENERATE_LIMIT_PER_HOUR ?? 8);
const allow = limiter(LIMIT);

interface Body {
  query?: string;
  fresh?: boolean;
  /** Only return an already-saved guide, never start a run (used to recover a dropped stream). */
  savedOnly?: boolean;
  byo?: ByoKey | null;
}

// Streams newline-delimited JSON AgentEvents so the UI can show the agent working.
// A visitor's own key (byo) is used for this request only: never stored or logged.
export async function POST(req: Request) {
  const { query, fresh, savedOnly, byo } = (await req.json().catch(() => ({}))) as Body;
  const q = (query ?? "").trim();
  if (!q || q.length > 120) return Response.json({ error: "Enter an app name or website (≤120 chars)." }, { status: 400 });
  const key = byo && typeof byo.apiKey === "string" && byo.apiKey.length > 8 && PROVIDERS.some((p) => p.id === byo.provider) ? byo : null;

  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (e: AgentEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        const curated = findCurated(q);
        if (curated && !fresh) {
          send({ type: "log", level: "ok", text: `${curated.name} is in the curated library — opening the hand-verified guide` });
          send({ type: "done", slug: curated.slug, guide: curated });
          return;
        }
        const cached = fresh ? null : await loadGenerated(slugify(q));
        if (cached && Date.now() - Date.parse(cached.generatedAt) < CACHE_DAYS * 864e5) {
          send({ type: "log", level: "ok", text: `Found a guide generated ${cached.generatedAt.slice(0, 10)} — reusing it (use "re-run agent" on the guide for a fresh one)` });
          send({ type: "done", slug: cached.slug, guide: cached });
          return;
        }
        if (savedOnly) {
          send({ type: "error", message: "No saved guide yet." });
          return;
        }
        const ip = ipOf(req);
        if (!key && !allow(ip)) {
          send({ type: "error", message: `Limit reached: ${LIMIT} new guides per hour on the shared key. Add your own key with ⚙ to keep going, or try again later.` });
          return;
        }
        const guide = await runAgent(q, { emit: send, byo: key, signal: abort.signal });
        await saveGuide(guide);
        send({ type: "log", level: "ok", text: `Saved — shareable at /guides/${guide.slug}` });
        send({ type: "done", slug: guide.slug, guide });
      } catch (e) {
        const msg = (e as Error).message;
        // Never echo a visitor's key back, even inside a provider error message.
        send({ type: "error", message: (key ? msg.split(key.apiKey).join("•••") : msg).slice(0, 400) });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
