"use client";

import type { Fact } from "@/lib/facts";
import { Md } from "./bits";
import { loadByo } from "./ModelSettings";

// Shared by the guide chat and the home search's /ask mode.

export type ChatMsg = { role: "user" | "assistant"; content: string };

export const CHIP: Record<Fact["evidence"], string> = {
  tested: "border-tested/60 bg-tested/15 text-tested",
  sourced: "border-sourced/60 bg-sourced/15 text-sourced",
  inferred: "border-dashed border-inferred/70 text-inferred",
  path: "border-accent/60 bg-accent/10 text-accent",
  guide: "border-white/50 bg-white/10 text-text",
};

/** POST /api/ask and feed the NDJSON stream to callbacks. Throws on HTTP or model errors. */
export async function streamAsk(
  body: { slug?: string; messages: ChatMsg[]; withFacts?: boolean },
  on: { delta: (v: string) => void; facts?: (f: Fact[]) => void; done?: (model: string) => void },
  signal: AbortSignal,
) {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, byo: loadByo() }),
    signal,
  });
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
    for (const l of lines) {
      if (!l.trim()) continue;
      const e = JSON.parse(l) as { t: "d"; v: string } | { t: "facts"; v: Fact[] } | { t: "done"; model: string } | { t: "err"; msg: string };
      if (e.t === "d") on.delta(e.v);
      else if (e.t === "facts") on.facts?.(e.v);
      else if (e.t === "done") on.done?.(e.model);
      else throw new Error(e.msg);
    }
  }
}

/** Markdown-lite answer text with [R2, S1] citations turned into evidence chips. */
export function AnswerText({ text, facts, onPeek }: { text: string; facts: Map<string, Fact>; onPeek: (f: Fact) => void }) {
  return (
    <>
      {text.split("\n").map((line, li) => {
        const bullet = /^\s*[-*] /.test(line);
        const parts = line.replace(/^\s*[-*] /, "").split(/(\[[A-Z]\d+(?:\s*,\s*[A-Z]\d+)*\])/g);
        return (
          <div key={li} className={`${bullet ? "flex gap-2" : ""} ${line.trim() ? "" : "h-2"}`}>
            {bullet && <span className="text-accent">■</span>}
            <span>
              {parts.map((p, i) => {
                const ids = p.match(/^\[(.+)\]$/)?.[1].split(/\s*,\s*/);
                if (!ids) return <Md key={i} text={p} />;
                return ids.map((id) => {
                  const f = facts.get(id);
                  return (
                    <button
                      key={`${i}-${id}`}
                      type="button"
                      onClick={() => f && onPeek(f)}
                      title={f?.text}
                      className={`mx-0.5 inline-block border px-1 align-[1px] font-mono text-[10px] leading-[14px] hover:brightness-125 ${f ? CHIP[f.evidence] : "border-line text-faint line-through"}`}
                    >
                      {id}
                    </button>
                  );
                });
              })}
            </span>
          </div>
        );
      })}
    </>
  );
}

/** The fact behind a citation chip, with its verbatim quote. */
export function FactPeek({ fact, onClose, className = "" }: { fact: Fact; onClose: () => void; className?: string }) {
  return (
    <div className={`fade-in border-2 border-[#13221a] bg-panel-2 p-3 shadow-[4px_4px_0_#13221a] ${className}`}>
      <div className="flex items-center justify-between">
        <span className={`border px-1 font-mono text-[10px] ${CHIP[fact.evidence]}`}>
          {fact.id} · {fact.evidence === "guide" ? "library" : fact.evidence}
        </span>
        <button type="button" onClick={onClose} className="font-pixel text-[10px] text-faint hover:text-text">
          close
        </button>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-text/90">
        <Md text={fact.text} />
      </p>
      {fact.quote && <p className="mt-2 border-l-2 border-sourced/50 pl-2 text-[12px] italic text-muted">“{fact.quote}”</p>}
      {fact.sources?.length ? <p className="mt-1.5 font-mono text-[10px] text-faint">sources: {fact.sources.join(", ")}</p> : null}
      {fact.href && (
        <a href={fact.href} className="mt-2 inline-block font-mono text-[11px] text-accent hover:text-white">
          open the guide →
        </a>
      )}
    </div>
  );
}
