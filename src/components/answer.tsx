"use client";

import { useState } from "react";
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

/** A tool the chat ran before answering (search, read, guide), Claude Code style. */
export type ChatTool = { id: string; name: string; arg: string; status: "run" | "ok" | "warn"; result?: string };

type Handlers = { delta: (v: string) => void; facts?: (f: Fact[]) => void; thought?: (v: string) => void; tool?: (t: ChatTool) => void; done?: (model: string) => void };

/** POST and feed the NDJSON stream to callbacks. Throws on HTTP or model errors. */
async function streamNd(path: string, body: object, on: Handlers, signal: AbortSignal) {
  const res = await fetch(path, {
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
      const e = JSON.parse(l) as { t: "d"; v: string } | { t: "th"; v: string } | { t: "facts"; v: Fact[] } | ({ t: "tool" } & ChatTool) | { t: "done"; model: string } | { t: "err"; msg: string };
      if (e.t === "d") on.delta(e.v);
      else if (e.t === "tool") on.tool?.({ id: e.id, name: e.name, arg: e.arg, status: e.status, result: e.result });
      else if (e.t === "th") on.thought?.(e.v);
      else if (e.t === "facts") on.facts?.(e.v);
      else if (e.t === "done") on.done?.(e.model);
      else throw new Error(e.msg);
    }
  }
}

/** Grounded Q&A over one guide (slug) or the whole library. */
export const streamAsk = (body: { slug?: string; messages: ChatMsg[]; withFacts?: boolean }, on: Handlers, signal: AbortSignal) => streamNd("/api/ask", body, on, signal);

/** Open chat, not limited to the guides; `search` lets it search the web. Streams tool calls and reasoning before the answer. */
export const streamChat = (messages: ChatMsg[], search: boolean, on: Handlers, signal: AbortSignal) => streamNd("/api/chat", { messages, search }, on, signal);

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

/** Markdown for open chat: fenced code (with copy), headings, bullets, numbered steps, links. */
export function RichText({ text }: { text: string }) {
  // Split on ``` fences; an unclosed fence while streaming still renders as code.
  const blocks = text.split(/^```/m);
  return (
    <div className="space-y-1">
      {blocks.map((b, i) => {
        if (i % 2) {
          const nl = b.indexOf("\n");
          const lang = nl < 0 ? b.trim() : b.slice(0, nl).trim();
          const code = nl < 0 ? "" : b.slice(nl + 1).replace(/\n$/, "");
          return <CodeBlock key={i} lang={lang} code={code} />;
        }
        return b.split("\n").map((line, li) => <RichLine key={`${i}-${li}`} line={line} />);
      })}
    </div>
  );
}

function RichLine({ line }: { line: string }) {
  if (!line.trim()) return <div className="h-1.5" />;
  const h = /^(#{1,4})\s+(.*)$/.exec(line);
  if (h) return <p className="pt-1.5 font-semibold text-text"><Inline text={h[2]} /></p>;
  const ul = /^(\s*)[-*•]\s+(.*)$/.exec(line);
  if (ul)
    return (
      <div className="flex gap-2" style={{ paddingLeft: Math.min(ul[1].length, 6) * 6 }}>
        <span className="text-accent">■</span>
        <span className="min-w-0"><Inline text={ul[2]} /></span>
      </div>
    );
  const ol = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
  if (ol)
    return (
      <div className="flex gap-2" style={{ paddingLeft: Math.min(ol[1].length, 6) * 6 }}>
        <span className="min-w-[1.25rem] font-mono text-[12px] leading-[1.6rem] text-accent">{ol[2]}.</span>
        <span className="min-w-0"><Inline text={ol[3]} /></span>
      </div>
    );
  if (/^>\s?/.test(line)) return <p className="border-l-2 border-line pl-3 text-muted"><Inline text={line.replace(/^>\s?/, "")} /></p>;
  if (/^(-{3,}|\*{3,})$/.test(line.trim())) return <hr className="my-2 border-line" />;
  return <p><Inline text={line} /></p>;
}

/** Bold, inline code and [links](https://…) inside one line; site links (/guides/…) open in place. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[^\]\n]+\]\((?:https?:\/\/|\/(?!\/))[^)\s]+\))/g).map((p, i) => {
        const m = /^\[([^\]]+)\]\(((?:https?:\/\/|\/(?!\/))[^)\s]+)\)$/.exec(p);
        const local = m?.[2].startsWith("/");
        return m ? (
          <a key={i} href={m[2]} {...(local ? {} : { target: "_blank", rel: "noreferrer noopener" })} className="text-accent underline decoration-dotted underline-offset-2 hover:text-white">
            {m[1]}
          </a>
        ) : (
          <Md key={i} text={p.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")} />
        );
      })}
    </>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="my-2 border border-line bg-[#070c09]">
      <div className="flex items-center justify-between border-b border-line px-3 py-1 font-mono text-[10px] text-faint">
        <span>{lang || "code"}</span>
        <CopyButton text={code} />
      </div>
      <pre className="no-scrollbar overflow-x-auto px-3 py-2 font-mono text-[12px] leading-relaxed text-text/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function CopyButton({ text, label = "copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        })
      }
      className="hover:text-text"
    >
      {copied ? "copied ✓" : label}
    </button>
  );
}
