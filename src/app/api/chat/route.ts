import { llmJSON, llmText, type ByoKey, type ChatMessage } from "@/lib/agent/llm";
import { PROVIDERS } from "@/lib/agent/providers";
import { readPage, safeUrl, searchWeb } from "@/lib/agent/web";
import { factSheet } from "@/lib/facts";
import { CURATED } from "@/lib/guides";
import { ipOf, limiter } from "@/lib/ratelimit";
import { getGuide, listGenerated } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const LIMIT = Number(process.env.CHAT_LIMIT_PER_HOUR ?? 60);
const allow = limiter(LIMIT);

// /chat on the home page: an open conversation, not limited to the guides. /ask stays the
// grounded, cited mode; this one is for everything else, with a few tools it can reach for.
const SYSTEM = (tools: string, search: boolean) => `You are the chat mode of OAuth Ready, a site that helps developers get provider OAuth apps created and approved so their AI agents can connect to users' apps. Here you are a general assistant: help with anything the user brings (code, debugging, writing, planning, explanations, ideas, small talk), honestly and directly. Today is ${new Date().toISOString().slice(0, 10)}.

- Format with Markdown: short paragraphs, "- " bullets, "1. " steps, \`inline code\`, **bold**, and fenced code blocks with a language (\`\`\`ts).
- Match the length to the question. No filler, no restating the question.
- Never ask for or repeat secrets such as API keys or passwords.
${
  tools
    ? `- Tools ran before you answered; their results are below. Prefer them over memory, and cite what you use inline as [page title](url), or [App guide](/guides/slug) for a library guide. If they don't settle the question, say so.

TOOL RESULTS
${tools}`
    : `- No tools ran for this message${search ? "" : " (web search is off; the user can turn it on below the chat box)"}. For a provider's current OAuth policy, answer what you know and flag that it may be out of date; [the app's guide](/guides/slug) or [a live investigation](/generate?q=App) has checked details.`
}`;

// Decides which tools, if any, the latest message needs. Most messages need none.
const PLAN = (library: string, search: boolean) => `You pick tools for a chat assistant on OAuth Ready before it answers the user's latest message. Today is ${new Date().toISOString().slice(0, 10)}.

Tools:
- "guides": library guides (verified OAuth app setup, review, scopes, timelines) for apps the user asks about. Slugs from the list below only, at most 2.
${
  search
    ? `- "search": one web search query, for current or factual things you may not know or that change: news, releases, prices, docs, policies, people, companies. Not for coding help, writing, math, opinions or small talk.\n`
    : `- "search": always null. The user has web search turned off.\n`
}- "read": URLs the user pasted and wants read, at most 3.

Library (slug: name):
${library}

Reply with JSON only: {"guides": [], "search": null, "read": []}. Leave a tool empty or null when it isn't needed.`;

interface Body {
  messages?: ChatMessage[];
  /** The user's web search toggle. Off: guides and pasted links only. */
  search?: boolean;
  byo?: ByoKey | null;
}

type Plan = { guides?: unknown; search?: unknown; read?: unknown };

// Streams NDJSON: {t:"tool",id,name,arg,status,result?} tool calls, {t:"th",v} reasoning,
// {t:"d",v} answer text, then {t:"done",model} or {t:"err",msg}.
export async function POST(req: Request) {
  const { messages, byo, search } = (await req.json().catch(() => ({}))) as Body;
  const history = (Array.isArray(messages) ? messages : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!history.length || history[history.length - 1].role !== "user") return Response.json({ error: "Say something first." }, { status: 400 });

  const key = byo && typeof byo.apiKey === "string" && byo.apiKey.length > 8 && PROVIDERS.some((p) => p.id === byo.provider) ? byo : null;
  if (!key && !allow(ipOf(req))) {
    return Response.json({ error: `Limit of ${LIMIT} messages an hour on the shared key. Add your own key in model settings to keep going.` }, { status: 429 });
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
      let n = 0;
      const tool = (name: string, arg: string) => {
        const id = `c${++n}`;
        send({ t: "tool", id, name, arg, status: "run" });
        return (status: "ok" | "warn", result: string) => send({ t: "tool", id, name, arg, status, result });
      };
      try {
        const last = history[history.length - 1].content;
        const context: string[] = [];
        // Tiny messages ("hi", "thanks") never need tools; skip the planning call.
        if (last.trim().length > 12) {
          const library = [...CURATED, ...(await listGenerated()).filter((g) => !CURATED.some((c) => c.slug === g.slug))];
          let plan: Plan = {};
          try {
            const convo = history
              .slice(-6)
              .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content.slice(0, 1200)}`)
              .join("\n\n");
            plan = (await llmJSON<Plan>(PLAN(library.map((g) => `${g.slug}: ${g.name}`).join("\n"), search === true), convo, { tier: "fast", think: false, byo: key, signal: abort.signal })).data;
          } catch {
            if (abort.signal.aborted) throw new Error("stopped");
          }
          const slugs = new Set(library.map((g) => g.slug));
          const guides = (Array.isArray(plan.guides) ? plan.guides : []).filter((s): s is string => typeof s === "string" && slugs.has(s)).slice(0, 2);
          const pasted = last.match(/https?:\/\/[^\s)<>"']+/g) ?? [];
          const reads = [...new Set([...pasted, ...(Array.isArray(plan.read) ? plan.read : [])].filter((u): u is string => typeof u === "string" && !!safeUrl(u)))].slice(0, 3);
          const query = search === true && typeof plan.search === "string" && plan.search.trim() ? plan.search.trim().slice(0, 200) : null;

          await Promise.all([
            ...guides.map(async (slug) => {
              const g = await getGuide(slug);
              if (!g) return;
              const done = tool("Guide", g.name);
              context.push(`[${g.name} guide](/guides/${g.slug})\n${factSheet(g).slice(0, 9000)}`);
              done("ok", `${g.verdict.label} · difficulty ${g.verdict.difficulty}/5`);
            }),
            ...reads.map(async (url) => {
              const done = tool("Read", url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80));
              const p = await readPage(url, 10000);
              if (p.ok) context.push(`[${p.title || url}](${p.url})\n${p.text}`);
              done(p.ok ? "ok" : "warn", p.ok ? `${(p.text.length / 1000).toFixed(1)}k chars · ${p.title}` : p.status);
            }),
            (async () => {
              if (!query) return;
              const done = tool("Search", query);
              const hits = await searchWeb(query, last.slice(0, 500), abort.signal);
              if (!hits?.length) return done("warn", "search unavailable right now");
              done("ok", `${hits.length} results`);
              context.push(`Web search for "${query}":\n${hits.map((h) => `- [${h.title || h.url}](${h.url}): ${h.snippet}`).join("\n")}`);
              // Read the top two results in full: snippets alone miss the detail.
              await Promise.all(
                hits.slice(0, 2).map(async (h) => {
                  const r = tool("Read", h.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80));
                  const p = await readPage(h.url, 6000);
                  if (p.ok) context.push(`[${p.title || h.title}](${p.url})\n${p.text}`);
                  r(p.ok ? "ok" : "warn", p.ok ? `${(p.text.length / 1000).toFixed(1)}k chars · ${p.title}` : p.status);
                }),
              );
            })(),
          ]);
          if (abort.signal.aborted) throw new Error("stopped");
        }

        const r = await llmText([{ role: "system", content: SYSTEM(context.join("\n\n---\n\n"), search === true) }, ...history], {
          tier: "fast",
          byo: key,
          signal: abort.signal,
          think: true,
          onEvent: (e) => {
            if (e.kind === "delta") send({ t: "d", v: e.text });
            else if (e.kind === "thinking") send({ t: "th", v: e.text });
          },
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
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
