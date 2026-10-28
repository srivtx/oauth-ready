import { llmText, type ByoKey, type ChatMessage } from "@/lib/agent/llm";
import { PROVIDERS } from "@/lib/agent/providers";
import { factSheet, factsOf, libraryFacts, librarySheet } from "@/lib/facts";
import { CURATED } from "@/lib/guides";
import { getGuide, listGenerated } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Questions on the site's own key are rate-limited per IP (best-effort, per instance).
const LIMIT = Number(process.env.ASK_LIMIT_PER_HOUR ?? 40);
const hits = new Map<string, number[]>();
function allow(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= LIMIT) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

const RULES = (scope: string) => `Rules:
- Ground answers in the facts below. Never invent scopes, timelines, URLs, prices or policies about a provider.
- After each sentence that relies on a fact, cite its id in square brackets, e.g. [R2] or [S1, G3].
- Be honest about evidence: when a sentence rests on an "inferred" fact, say it's an estimate.
- If the facts don't cover a question about OAuth, provider apps, scopes, app review or integrations, you may answer briefly from general knowledge: start that part with "General knowledge, not from ${scope}:" and give no citation. If it's about a specific provider's current policy, also suggest checking its docs.
- If the question has nothing to do with OAuth, APIs or integrations, say in one sentence that you only answer integration questions and suggest one you can answer.
- Be brief and practical: at most ~120 words. Plain text; you may use \`code\`, **bold**, and "- " bullets.`;

const SYSTEM = (sheet: string) => `You answer a developer's questions about creating and getting approval for this provider's OAuth app.

${RULES("this guide")}

${sheet}`;

const LIBRARY = (sheet: string) => `You answer a developer's questions about getting provider OAuth apps created and approved, across the OAuth Ready library. Each [L#] fact summarises one app's guide. Use them to compare apps, pick the fastest path, or point to the right guide. For deep detail on one app, suggest opening its guide.

${RULES("the library")}

${sheet}`;

interface Body {
  slug?: string;
  messages?: ChatMessage[];
  /** Send the guide's facts first, for callers that don't already have them (home /ask). */
  withFacts?: boolean;
  byo?: ByoKey | null;
}

// Streams NDJSON: optional {t:"facts",v}, then {t:"d",v} text deltas, then {t:"done",model,cost} or {t:"err",msg}.
export async function POST(req: Request) {
  const { slug, messages, withFacts, byo } = (await req.json().catch(() => ({}))) as Body;
  // With a slug: one guide's facts. Without: one summary fact per guide in the library.
  const g = slug ? await getGuide(slug) : null;
  if (slug && !g) return Response.json({ error: "Unknown guide." }, { status: 404 });
  const library = g ? [] : [...CURATED, ...(await listGenerated()).filter((x) => !CURATED.some((c) => c.slug === x.slug))];
  const history = (Array.isArray(messages) ? messages : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
  if (!history.length || history[history.length - 1].role !== "user") return Response.json({ error: "Ask a question." }, { status: 400 });

  const key = byo && typeof byo.apiKey === "string" && byo.apiKey.length > 8 && PROVIDERS.some((p) => p.id === byo.provider) ? byo : null;
  if (!key) {
    const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
    if (!allow(ip)) return Response.json({ error: `Limit of ${LIMIT} questions an hour on the shared key. Add your own key in model settings to keep going.` }, { status: 429 });
  }

  const enc = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: object) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        } catch {}
      };
      if (withFacts) send({ t: "facts", v: g ? factsOf(g) : libraryFacts(library) });
      try {
        const r = await llmText([{ role: "system", content: g ? SYSTEM(factSheet(g)) : LIBRARY(librarySheet(library)) }, ...history], {
          tier: "fast",
          byo: key,
          signal: abort.signal,
          onEvent: (e) => e.kind === "delta" && send({ t: "d", v: e.text }),
        });
        send({ t: "done", model: r.model, cost: r.cost });
      } catch (e) {
        let msg = String((e as Error).message);
        if (key) msg = msg.split(key.apiKey).join("[your key]");
        send({ t: "err", msg: msg.slice(0, 300) });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
