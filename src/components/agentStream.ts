import type { AgentEvent, Guide } from "@/lib/types";
import { loadByo } from "./ModelSettings";

// Client side of /api/generate, shared by the live agent page and /compare.

async function read(body: object, on: (e: AgentEvent) => void, signal: AbortSignal) {
  const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, byo: loadByo() }), signal });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) if (l.trim()) on(JSON.parse(l) as AgentEvent);
  }
}

/**
 * Stream an agent run, feeding each event to `on`. If the connection drops before the run ends
 * (seen in Firefox: "Error in input stream"), the agent has usually still finished and saved the
 * guide on the server, so look for the saved guide for a little while before giving up.
 */
export async function streamAgent(query: string, opts: { fresh?: boolean }, on: (e: AgentEvent) => void, signal: AbortSignal) {
  let ended = false;
  let dropped: unknown = null;
  try {
    await read(
      { query, fresh: opts.fresh },
      (e) => {
        if (e.type === "done" || e.type === "error") ended = true;
        on(e);
      },
      signal,
    );
  } catch (err) {
    if (signal.aborted) throw err;
    // A failure after the last event (done or error) changes nothing: that event already arrived.
    if (ended) return;
    dropped = err;
  }
  if (ended || signal.aborted) return;

  on({ type: "log", level: "warn", text: `Connection to the agent dropped (${String((dropped as Error)?.message ?? "stream ended early")}); checking for the saved guide` });
  on({ type: "status", verb: "Reconnecting" });
  for (let i = 0; i < 9 && !signal.aborted; i++) {
    let guide: Guide | null = null;
    await read(
      { query, savedOnly: true },
      (e) => {
        if (e.type === "done") guide = e.guide;
      },
      signal,
    ).catch(() => {});
    if (guide) {
      const g: Guide = guide;
      on({ type: "log", level: "ok", text: "Found the guide the agent saved" });
      on({ type: "done", slug: g.slug, guide: g });
      return;
    }
    // Wait between looks, but stop waiting the moment the run is cancelled.
    await new Promise<void>((r) => {
      const id = setTimeout(r, 5000);
      signal.addEventListener("abort", () => (clearTimeout(id), r()), { once: true });
    });
  }
  if (!signal.aborted) throw new Error("The connection to the agent dropped before the guide arrived. Try again.");
}
