import { llmText, type ByoKey, type ChatMessage } from "@/lib/agent/llm";
import { PROVIDERS } from "@/lib/agent/providers";
import { ipOf, limiter } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const LIMIT = Number(process.env.CHAT_LIMIT_PER_HOUR ?? 60);
const allow = limiter(LIMIT);

// /chat on the home page: an open conversation, not limited to the guides. /ask stays the
// grounded, cited mode; this one is for everything else.
const SYSTEM = () => `You are the chat mode of OAuth Ready, a site that helps developers get provider OAuth apps created and approved so their AI agents can connect to users' apps. Here you are a general assistant: help with anything the user brings (code, debugging, writing, planning, explanations, ideas, small talk), honestly and directly. Today is ${new Date().toISOString().slice(0, 10)}.

- Format with Markdown: short paragraphs, "- " bullets, "1. " steps, \`inline code\`, **bold**, and fenced code blocks with a language (\`\`\`ts).
- Match the length to the question. No filler, no restating the question.
- You can't browse the web or read the site's guides from here. When the user needs a provider's current OAuth policy, answer what you know, flag that it may be out of date, and mention that /ask answers from the cited guides and /investigate <app> researches an app live.
- Never ask for or repeat secrets such as API keys or passwords.`;

interface Body {
  messages?: ChatMessage[];
  byo?: ByoKey | null;
}

// Streams NDJSON: {t:"th",v} reasoning, {t:"d",v} answer text, then {t:"done",model} or {t:"err",msg}.
export async function POST(req: Request) {
  const { messages, byo } = (await req.json().catch(() => ({}))) as Body;
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
      try {
        const r = await llmText([{ role: "system", content: SYSTEM() }, ...history], {
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
