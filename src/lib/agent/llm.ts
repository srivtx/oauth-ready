// Provider-agnostic, streaming JSON completions.
//
// Default: DeepSeek V4.1 Flash through OpenCode Zen (~$0.30/$1.20 per 1M tokens,
// about 2¢ per guide). Gemini's free tier is kept as a fallback. Visitors can bring
// their own key for any provider in PROVIDERS. Keys arrive per request, are never
// stored or logged, and base URLs come only from this allow-list (no SSRF).

import { PROVIDERS } from "./providers";

export type Tier = "fast" | "smart";

export interface ByoKey {
  provider: string;
  model: string;
  apiKey: string;
}

interface Target {
  label: string; // shown in UI, e.g. "deepseek-v4.1-flash"
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Ordered list of targets to try for a tier. */
export function resolveTargets(tier: Tier, byo?: ByoKey | null): Target[] {
  if (byo?.apiKey) {
    const p = PROVIDERS.find((x) => x.id === byo.provider);
    if (!p) throw new Error("Unknown provider");
    const model = /^[\w.\-/:]{1,80}$/.test(byo.model) ? byo.model : p.models[0].id;
    return [{ label: `${model} (your key)`, baseUrl: p.baseUrl, apiKey: byo.apiKey, model }];
  }
  const out: Target[] = [];
  const oc = process.env.OPENCODE_API_KEY;
  if (oc) {
    const list = (tier === "smart" ? process.env.OPENCODE_MODELS_SMART : process.env.OPENCODE_MODELS_FAST) || "deepseek-v4.1-flash,qwen3.8-flash";
    for (const m of list.split(",").map((s) => s.trim()).filter(Boolean)) out.push({ label: m, baseUrl: PROVIDERS[0].baseUrl, apiKey: oc, model: m });
  }
  const gk = process.env.GEMINI_API_KEY;
  if (gk) {
    for (const m of tier === "smart" ? ["gemini-3-flash-preview", "gemini-3.1-flash-lite"] : ["gemini-3.1-flash-lite", "gemini-3-flash-preview"]) {
      out.push({ label: m, baseUrl: PROVIDERS.find((p) => p.id === "gemini")!.baseUrl, apiKey: gk, model: m });
    }
  }
  if (!out.length) throw new Error("No model configured: set OPENCODE_API_KEY or GEMINI_API_KEY, or add your own key in Settings.");
  return out;
}

export type StreamEvent =
  | { kind: "thinking"; text: string }
  | { kind: "content"; chars: number }
  | { kind: "delta"; text: string }
  | { kind: "fallback"; from: string; reason: string };

export interface LlmResult<T> {
  data: T;
  model: string;
  cost: number; // USD, when the provider reports it
  tokens: number;
}

const dead = new Set<string>(); // targets that hit a daily quota in this process

/**
 * Streams a JSON completion. `onEvent` receives reasoning text and progress as they
 * arrive, so the UI can show the model thinking. Falls back to the next target on
 * quota/availability errors.
 */
export async function llmJSON<T>(
  system: string,
  user: string,
  opts: { tier?: Tier; schema?: object; byo?: ByoKey | null; onEvent?: (e: StreamEvent) => void; signal?: AbortSignal; think?: boolean } = {},
): Promise<LlmResult<T>> {
  const targets = resolveTargets(opts.tier ?? "smart", opts.byo).filter((t) => !dead.has(t.label));
  const errors: string[] = [];
  for (const t of targets) {
    try {
      const r = await streamChat(t, [{ role: "system", content: system }, { role: "user", content: user }], { json: true, schema: opts.schema }, opts.onEvent, opts.signal, opts.think ?? true);
      return { data: parseJSON<T>(r.text), model: t.label, cost: r.cost, tokens: r.tokens };
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      const msg = String((e as Error).message);
      errors.push(`${t.label}: ${msg.slice(0, 160)}`);
      if (/per ?day|insufficient|balance|quota/i.test(msg)) dead.add(t.label);
      if (opts.byo || !/\b(400|402|404|408|429|500|502|503|504)\b|no text|valid JSON|timeout|terminated|fetch failed/i.test(msg)) break;
      opts.onEvent?.({ kind: "fallback", from: t.label, reason: msg.slice(0, 80) });
    }
  }
  throw new Error(`Model call failed. ${errors.join(" | ")}`);
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Streams a plain-text chat completion; text arrives as `delta` events. Same fallback chain as llmJSON. */
export async function llmText(
  messages: ChatMessage[],
  opts: { tier?: Tier; byo?: ByoKey | null; onEvent?: (e: StreamEvent) => void; signal?: AbortSignal; think?: boolean } = {},
): Promise<LlmResult<string>> {
  const targets = resolveTargets(opts.tier ?? "fast", opts.byo).filter((t) => !dead.has(t.label));
  const errors: string[] = [];
  for (const t of targets) {
    let started = false;
    try {
      const r = await streamChat(t, messages, { json: false }, (e) => {
        if (e.kind === "delta") started = true;
        opts.onEvent?.(e);
      }, opts.signal, opts.think ?? false);
      return { data: r.text, model: t.label, cost: r.cost, tokens: r.tokens };
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      const msg = String((e as Error).message);
      errors.push(`${t.label}: ${msg.slice(0, 160)}`);
      if (/per ?day|insufficient|balance|quota/i.test(msg)) dead.add(t.label);
      // Once text has reached the reader, switching models mid-answer would garble it.
      if (started || opts.byo || !/\b(400|402|404|408|429|500|502|503|504)\b|no text|timeout|terminated|fetch failed/i.test(msg)) break;
      opts.onEvent?.({ kind: "fallback", from: t.label, reason: msg.slice(0, 80) });
    }
  }
  throw new Error(`Model call failed. ${errors.join(" | ")}`);
}

function parseJSON<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error("Model did not return valid JSON");
  }
}

async function streamChat(
  t: Target,
  messages: ChatMessage[],
  mode: { json: boolean; schema?: object },
  onEvent?: (e: StreamEvent) => void,
  signal?: AbortSignal,
  think = true,
) {
  const schema = mode.schema;
  const body = (format: object) =>
    JSON.stringify({
      model: t.model,
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true },
      ...(mode.json && { response_format: format }),
      // DeepSeek can skip reasoning for mechanical steps: ~4x cheaper and much faster.
      ...(!think && /^deepseek/.test(t.model) && { thinking: { type: "disabled" } }),
      messages,
    });
  const timeout = AbortSignal.timeout(180_000);
  const sig = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const send = (format: object) =>
    fetch(`${t.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t.apiKey}` },
      body: body(format),
      signal: sig,
    });

  let res = await send(schema ? { type: "json_schema", json_schema: { name: "result", schema } } : { type: "json_object" });
  // Not every provider/model supports json_schema; retry once with plain JSON mode.
  if (res.status === 400 && schema) res = await send({ type: "json_object" });
  if (res.status === 429 || res.status === 503) {
    await new Promise((r) => setTimeout(r, 3000));
    res = await send({ type: "json_object" });
  }
  if (!res.ok || !res.body) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let cost = 0;
  let tokens = 0;
  let pendingThought = "";
  let lastFlush = 0;
  const flush = (force = false) => {
    if (pendingThought && (force || pendingThought.length > 60 || Date.now() - lastFlush > 250)) {
      onEvent?.({ kind: "thinking", text: pendingThought });
      pendingThought = "";
      lastFlush = Date.now();
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let chunk: {
        choices?: { delta?: { content?: string; reasoning_content?: string; reasoning?: string } }[];
        usage?: { total_tokens?: number; cost?: number };
        error?: { message?: string };
      };
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.error) throw new Error(`500: ${chunk.error.message ?? "stream error"}`);
      const d = chunk.choices?.[0]?.delta;
      const thought = d?.reasoning_content ?? d?.reasoning;
      if (thought) {
        pendingThought += thought;
        flush();
      }
      if (d?.content) {
        text += d.content;
        onEvent?.({ kind: "content", chars: text.length });
        if (!mode.json) onEvent?.({ kind: "delta", text: d.content });
      }
      if (chunk.usage) {
        tokens = chunk.usage.total_tokens ?? tokens;
        cost = chunk.usage.cost ?? cost;
      }
    }
  }
  flush(true);
  if (!text.trim()) throw new Error("no text returned");
  return { text, cost, tokens };
}
