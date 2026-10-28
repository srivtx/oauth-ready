"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Fact } from "@/lib/facts";
import { AnswerText, CHIP, FactPeek, streamAsk, type ChatMsg } from "./answer";
import { PixelIcon } from "./PixelIcon";

type Msg = ChatMsg & { model?: string; error?: boolean };

/**
 * Ask-the-guide: a chat that may only answer from this guide's facts and must cite them.
 * Each citation becomes a chip coloured by its evidence level; click it to see the fact and quote.
 */
export function AskGuide({ slug, name, facts, suggestions }: { slug: string; name: string; facts: Fact[]; suggestions: string[] }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [peek, setPeek] = useState<Fact | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const byId = new Map(facts.map((f) => [f.id, f]));

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    if (window.matchMedia("(max-width: 639px)").matches) html.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (peek ? setPeek(null) : setOpen(false));
    window.addEventListener("keydown", onKey);
    input.current?.focus();
    return () => {
      html.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, peek]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [msgs]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const history: Msg[] = [...msgs.filter((m) => !m.error), { role: "user", content: question }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setQ("");
    setBusy(true);
    const ac = new AbortController();
    ctrl.current = ac;
    const patch = (f: (m: Msg) => Msg) => setMsgs((ms) => [...ms.slice(0, -1), f(ms[ms.length - 1])]);
    try {
      await streamAsk(
        { slug, messages: history.map(({ role, content }) => ({ role, content })) },
        { delta: (v) => patch((m) => ({ ...m, content: m.content + v })), done: (model) => patch((m) => ({ ...m, model })) },
        ac.signal,
      );
    } catch (err) {
      if (!ac.signal.aborted) patch((m) => ({ ...m, content: (err as Error).message, error: true }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`no-print group fixed bottom-5 right-5 z-30 flex items-center gap-2 border-2 border-[#13221a] bg-accent px-3 py-2.5 font-pixel text-[11px] text-[#13221a] shadow-[4px_4px_0_#13221a] transition hover:-translate-y-0.5 ${open ? "pointer-events-none opacity-0" : ""}`}
      >
        <PixelIcon name="ask" size={16} accent="var(--hot)" />
        ask this guide
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-end font-sans text-text sm:inset-auto sm:bottom-5 sm:right-5">
            <div onClick={() => setOpen(false)} className="absolute inset-0 bg-black/60 sm:hidden" />
            <div
              role="dialog"
              aria-label={`Ask the ${name} guide`}
              className="fade-in relative flex h-[85vh] w-full flex-col border-2 border-[#13221a] bg-panel shadow-[8px_8px_0_rgba(0,0,0,0.55)] sm:h-[600px] sm:max-h-[calc(100vh-6rem)] sm:w-[420px]"
            >
              <div className="field grain flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <div className="font-pixel text-[10px] text-[#13221a]">ask / grounded</div>
                  <div className="font-semibold text-white">Ask the {name} guide</div>
                  <div className="mt-0.5 font-mono text-[10px] text-white/80">answers only from this guide&apos;s evidence · every claim cited</div>
                </div>
                <button onClick={() => setOpen(false)} className="font-pixel text-[10px] text-white/80 hover:text-white">
                  esc ✕
                </button>
              </div>

              <div ref={list} className="no-scrollbar flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 text-sm leading-relaxed">
                {msgs.length === 0 && (
                  <div>
                    <p className="text-muted">
                      Ask anything this guide covers. Citations like <span className={`border px-1 font-mono text-[10px] ${CHIP.sourced}`}>R2</span> show
                      where each answer comes from and how solid it is.
                    </p>
                    <div className="mt-4 space-y-1.5">
                      {suggestions.map((s) => (
                        <button key={s} onClick={() => ask(s)} className="block w-full border border-line px-3 py-2 text-left text-[13px] text-muted hover:border-accent hover:text-text">
                          <span className="mr-2 font-pixel text-[10px] text-accent">→</span>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {msgs.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] bg-accent px-3 py-2 text-[#13221a]">{m.content}</div>
                    </div>
                  ) : (
                    <div key={i} className="fade-in">
                      <div className={`${m.error ? "border border-danger/40 bg-danger/10 p-3 text-danger" : "text-text/90"}`}>
                        {m.content ? <AnswerText text={m.content} facts={byId} onPeek={setPeek} /> : <span className="shimmer font-mono text-xs">reading the guide…</span>}
                        {busy && i === msgs.length - 1 && m.content && <span className="caret" />}
                      </div>
                      {m.model && <div className="mt-1.5 font-mono text-[10px] text-faint">{m.model}</div>}
                    </div>
                  ),
                )}
              </div>

              {peek && <FactPeek fact={peek} onClose={() => setPeek(null)} className="absolute inset-x-3 bottom-[76px]" />}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(q);
                }}
                className="flex items-end gap-2 border-t border-line p-3"
              >
                <textarea
                  ref={input}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask(q);
                    }
                  }}
                  rows={1}
                  maxLength={500}
                  placeholder={`e.g. can I skip ${name}'s review?`}
                  className="max-h-28 min-h-[40px] flex-1 resize-none border border-line bg-bg px-3 py-2 font-mono text-[13px] outline-none placeholder:text-faint focus:border-accent"
                />
                {busy ? (
                  <button type="button" onClick={() => ctrl.current?.abort()} className="h-10 border border-line px-3 font-pixel text-[10px] text-muted hover:text-text">
                    stop
                  </button>
                ) : (
                  <button disabled={!q.trim()} className="h-10 bg-accent px-3 font-pixel text-[11px] text-[#13221a] hover:bg-white disabled:opacity-40">
                    ask →
                  </button>
                )}
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
