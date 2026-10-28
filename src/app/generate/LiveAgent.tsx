"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoTile } from "@/components/LogoTile";
import { streamAgent } from "@/components/agentStream";
import { ModelSettings } from "@/components/ModelSettings";
import { navStart } from "@/components/NavProgress";
import { PixelIcon } from "@/components/PixelIcon";
import { PixelScatter } from "@/components/pixel";
import type { AgentEvent, Guide } from "@/lib/types";

const TODOS: { id: "plan" | "read" | "follow" | "probe" | "write" | "check"; label: string }[] = [
  { id: "plan", label: "Identify the app, plan sources" },
  { id: "read", label: "Search, map and read the docs" },
  { id: "follow", label: "Follow OAuth / review links" },
  { id: "probe", label: "Probe the real OAuth endpoints" },
  { id: "write", label: "Write guide from evidence" },
  { id: "check", label: "Verify quotes, citations, links" },
];

const GLYPHS = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

type Tool = Extract<AgentEvent, { type: "tool" }> & { t: number };
type Entry =
  | { kind: "tool"; ids: string[]; name: string }
  | { kind: "thinking"; text: string; t: number }
  | { kind: "log"; level: "info" | "ok" | "warn" | "err"; text: string; url?: string };

const DOT = { run: "text-muted pulse-dot", ok: "text-tested", warn: "text-you", err: "text-danger" } as const;

export function LiveAgent() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const fresh = params.get("fresh") === "1";
  // A new query is a new run: start from a clean slate rather than reusing the last one's state.
  return <Run key={`${fresh}:${q}`} q={q} fresh={fresh} />;
}

function Run({ q, fresh }: { q: string; fresh: boolean }) {
  const router = useRouter();

  const [step, setStep] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tools, setTools] = useState<Record<string, Tool>>({});
  const [use, setUse] = useState<Record<string, { claims: number; verified: number }>>({});
  const [verb, setVerb] = useState("Warming up");
  const [usage, setUsage] = useState({ tokens: 0, cost: 0, model: "" });
  const [done, setDone] = useState<Guide | null>(null);
  const [app, setApp] = useState<{ name: string; slug: string; website: string; logo?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [glyph, setGlyph] = useState(0);
  const [autoOpen, setAutoOpen] = useState(true);
  const [countdown, setCountdown] = useState(4);
  const t0 = useRef(Date.now());
  const ctrl = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const running = !done && !error && !stopped;

  const stop = useCallback(() => {
    if (!running) return;
    ctrl.current?.abort();
    setStopped(true);
    setTools((m) => Object.fromEntries(Object.entries(m).map(([k, t]) => [k, t.status === "run" ? { ...t, status: "err", result: "interrupted" } : t])));
  }, [running]);

  // Stream the agent run.
  useEffect(() => {
    if (!q) return;
    t0.current = Date.now();
    const ac = new AbortController();
    ctrl.current = ac;
    const now = () => (Date.now() - t0.current) / 1000;

    const handle = (e: AgentEvent) => {
      switch (e.type) {
        case "identified":
          setApp({ name: e.name, slug: e.slug, website: e.website, logo: e.logo });
          break;
        case "step":
          setStep(e.id);
          break;
        case "status":
          setVerb(e.verb);
          break;
        case "usage":
          setUsage({ tokens: e.tokens, cost: e.costUsd, model: e.model ?? "" });
          break;
        case "tool":
          setTools((m) => ({ ...m, [e.id]: { ...e, t: m[e.id]?.t ?? now() } }));
          if (e.status === "run")
            setEntries((list) => {
              const last = list[list.length - 1];
              if (last?.kind === "tool" && last.name === e.name) return [...list.slice(0, -1), { ...last, ids: [...last.ids, e.id] }];
              return [...list, { kind: "tool", ids: [e.id], name: e.name }];
            });
          break;
        case "thinking":
          setEntries((list) => {
            const last = list[list.length - 1];
            if (last?.kind === "thinking") return [...list.slice(0, -1), { ...last, text: last.text + e.text }];
            return [...list, { kind: "thinking", text: e.text, t: now() }];
          });
          break;
        case "log":
          setEntries((list) => [...list, { kind: "log", level: e.level, text: e.text, url: e.url }]);
          break;
        case "sourceUse":
          setUse((u) => ({ ...u, [e.url]: { claims: e.claims, verified: e.verified } }));
          break;
        case "error":
          setError(e.message);
          break;
        case "done":
          setDone(e.guide);
          // Cached and curated hits skip the identify step: fill the header from the guide.
          setApp((cur) => cur ?? { name: e.guide.name, slug: e.guide.slug, website: e.guide.website, logo: e.guide.logo });
          setStep("finished");
          break;
      }
    };

    // Start on the next tick, so React's dev double-mount doesn't launch two runs. Leaving the
    // page stops the run instead of leaving it streaming in the background.
    const id = setTimeout(async () => {
      try {
        await streamAgent(q, { fresh }, handle, ac.signal);
      } catch (err) {
        if (!ac.signal.aborted) {
          setError((err as Error).message);
          setTools((m) => Object.fromEntries(Object.entries(m).map(([k, t]) => [k, t.status === "run" ? { ...t, status: "err", result: "connection lost" } : t])));
        }
      }
    }, 0);
    return () => {
      clearTimeout(id);
      ac.abort();
    };
  }, [q, fresh]);

  // Spinner + clock.
  useEffect(() => {
    if (!running) return;
    const a = setInterval(() => setGlyph((g) => (g + 1) % GLYPHS.length), 120);
    const b = setInterval(() => setElapsed(Math.floor((Date.now() - t0.current) / 1000)), 250);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [running]);

  // Esc to interrupt, like Claude Code.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stop]);

  // Follow the transcript while it grows (unless the reader scrolled up).
  useEffect(() => {
    const el = bottom.current;
    if (!el) return;
    const nearBottom = window.innerHeight + window.scrollY > document.body.scrollHeight - 260;
    if (nearBottom) el.scrollIntoView({ block: "end" });
  }, [entries, tools, done]);

  // Auto-open the finished guide after a short countdown.
  useEffect(() => {
    if (!done || !autoOpen) return;
    if (countdown <= 0) {
      // Replace, so Back from the guide doesn't land here and start the run (and redirect) again.
      navStart();
      router.replace(`/guides/${done.slug}`);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [done, autoOpen, countdown, router]);

  if (!q)
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        No app given.{" "}
        <Link href="/" className="text-accent underline">
          Go back
        </Link>
      </div>
    );

  const idx = step === "finished" ? TODOS.length : TODOS.findIndex((s) => s.id === step);

  return (
    <div>
      {/* Header band */}
      <section className="field grain relative overflow-hidden">
        <PixelScatter seed={`live-${q}`} className="opacity-60" />
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-5 px-4 py-6 sm:px-6">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden border-2 border-[#13221a] shadow-[4px_4px_0_#13221a] sm:h-28 sm:w-28">
            {app ? (
              <LogoTile g={{ slug: app.slug, name: app.name, logo: app.logo }} n={30} className="h-full w-full" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-field-deep font-pixel text-3xl text-white/80">
                <span className="pulse-dot">?</span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-pixel text-[11px] text-[#13221a]">{running ? "live investigation" : done ? "investigation complete" : "investigation stopped"}</div>
            <h1 className="mt-1 truncate text-3xl font-semibold text-white sm:text-4xl">{app?.name ?? q}</h1>
            <div className="mt-1 font-mono text-[11px] text-white/80 sm:text-xs">
              {app ? app.website.replace(/^https?:\/\//, "") : "identifying…"} · how to create + get approval for an OAuth app
            </div>
          </div>
          <ModelSettings />
        </div>
      </section>

      <Track idx={idx} failed={!!error || stopped} />

    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        {/* Prompt line */}
        <div className="border border-line bg-panel px-4 py-3 font-mono text-sm">
          <span className="text-accent">&gt;</span> investigate <span className="text-text">&quot;{q}&quot;</span>
        </div>

        {/* Transcript */}
        <div className="mt-5 space-y-3 font-mono text-[13px] leading-relaxed">
          {entries.map((en, i) =>
            en.kind === "tool" ? (
              <ToolGroup key={i} name={en.name} tools={en.ids.map((id) => tools[id]).filter(Boolean)} />
            ) : en.kind === "thinking" ? (
              <Thinking key={i} text={en.text} live={running && i === entries.length - 1} />
            ) : (
              <div key={i} className="fade-in flex gap-2">
                <span className={en.level === "warn" ? "text-you" : en.level === "err" ? "text-danger" : "text-tested"}>⏺</span>
                <span className="text-muted">{en.text}</span>
              </div>
            ),
          )}

          {running && (
            <div className="flex items-baseline gap-2 pt-1">
              <span className="w-3 text-accent">{GLYPHS[glyph]}</span>
              <span className="shimmer font-medium">{verb}…</span>
              <span className="text-faint">
                ({elapsed}s{usage.tokens ? ` · ↓ ${(usage.tokens / 1000).toFixed(1)}k tokens` : ""}
                {usage.cost ? ` · $${usage.cost.toFixed(3)}` : ""} · <button onClick={stop} className="underline decoration-dotted hover:text-text">esc to interrupt</button>)
              </span>
            </div>
          )}

          {stopped && (
            <div className="flex gap-2">
              <span className="text-danger">⏺</span>
              <span>
                Interrupted by user · <button onClick={() => location.reload()} className="text-accent underline">run again</button>
              </span>
            </div>
          )}

          {error && (
            <div className=" border border-danger/40 bg-danger/10 p-3">
              <div className="flex gap-2 text-danger">
                <span>⏺</span>
                <span>{error}</span>
              </div>
              <div className="mt-2 pl-5 text-muted">
                <button onClick={() => location.reload()} className="text-accent underline">
                  retry
                </button>{" "}
                · or pick another model with ⚙ above
              </div>
            </div>
          )}

          {done && (
            <div className="fade-in mt-4 border border-tested/40 bg-tested/5 p-4 font-sans">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-xs uppercase tracking-wider text-tested">⏺ guide ready</div>
                  <div className="mt-1 text-lg font-semibold">
                    {done.name} · <span className="text-accent">{done.verdict.label}</span> · {done.verdict.difficulty}/5
                  </div>
                  <p className="mt-1 max-w-xl text-sm text-muted">{done.verdict.headline}</p>
                </div>
                <Link href={`/guides/${done.slug}`} className=" bg-accent px-4 py-2 font-mono text-sm font-semibold text-bg hover:brightness-110">
                  open guide →
                </Link>
              </div>
              <EvidenceMix g={done} />
              {done.run && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-faint">
                  <span>{done.run.seconds}s</span>
                  <span>{done.run.pagesRead} pages read</span>
                  <span>
                    {done.run.quotesVerified}/{done.run.claimsChecked} quotes verified
                  </span>
                  <span>{(done.run.tokens / 1000).toFixed(1)}k tokens</span>
                  <span>${done.run.costUsd.toFixed(3)}</span>
                  <span>{done.model}</span>
                </div>
              )}
              {autoOpen && (
                <div className="mt-2 font-mono text-[11px] text-faint">
                  opening in {countdown}s ·{" "}
                  <button onClick={() => setAutoOpen(false)} className="underline hover:text-text">
                    stay here
                  </button>
                </div>
              )}
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>

      {/* Run stats + sources the agent touched */}
      <aside className="order-first lg:order-none">
        <div className="space-y-4 lg:sticky lg:top-20">
          <div className="grid grid-cols-3 gap-px overflow-hidden border border-line bg-line font-mono">
            {[
              [`${elapsed}s`, "elapsed"],
              [`${(usage.tokens / 1000).toFixed(1)}k`, "tokens"],
              [`$${usage.cost.toFixed(3)}`, "cost"],
            ].map(([v, k]) => (
              <div key={k} className="bg-panel px-3 py-2.5">
                <div className="text-sm text-text">{v}</div>
                <div className="text-[10px] text-faint">{k}</div>
              </div>
            ))}
          </div>
          {usage.model && <div className="truncate font-mono text-[11px] text-faint">model {usage.model}</div>}
          <Sources tools={Object.values(tools)} use={use} />
        </div>
      </aside>
    </div>
    </div>
  );
}

function ToolGroup({ name, tools }: { name: string; tools: Tool[] }) {
  const [open, setOpen] = useState(false);
  if (!tools.length) return null;
  const busy = tools.some((t) => t.status === "run");
  const status = busy ? "run" : tools.some((t) => t.status === "err") ? "err" : tools.every((t) => t.status === "warn") ? "warn" : "ok";

  // Small groups render as individual rows, Claude Code style.
  if (tools.length < 3)
    return (
      <>
        {tools.map((t) => (
          <ToolRow key={t.id} t={t} />
        ))}
      </>
    );

  const ok = tools.filter((t) => t.status === "ok").length;
  const warn = tools.filter((t) => t.status === "warn").length;
  const latest = [...tools].reverse().find((t) => t.status !== "run") ?? tools[tools.length - 1];
  const noun = name === "Read" ? "pages" : name === "Fetch" ? "fetches" : name === "Probe" ? "probes" : "calls";
  return (
    <div className="fade-in">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full gap-2 text-left">
        <span className={DOT[status]}>⏺</span>
        <span>
          <span className="font-semibold text-text">{name}</span>{" "}
          <span className="text-muted">
            {tools.length} {noun}
          </span>{" "}
          <span className="text-faint">({open ? "click to collapse" : "click to expand"})</span>
        </span>
      </button>
      <div className="flex gap-2 pl-1.5 text-muted">
        <span className="text-faint">⎿</span>
        <span>
          {busy ? <span>{tools.filter((t) => t.status === "run").length} in flight · </span> : null}
          <span className="text-tested">{ok} ok</span>
          {warn ? <span className="text-you"> · {warn} dead/unreadable</span> : null}
          {!open && latest?.result ? <span className="text-faint"> · latest: {latest.result.slice(0, 70)}</span> : null}
        </span>
      </div>
      {open && (
        <div className="mt-1 space-y-1 border-l border-line pl-4">
          {tools.map((t) => (
            <ToolRow key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolRow({ t }: { t: Tool }) {
  return (
    <div className="fade-in">
      <div className="flex gap-2">
        <span className={DOT[t.status]}>⏺</span>
        <span className="min-w-0 break-all">
          <span className="font-semibold text-text">{t.name}</span>
          <span className="text-muted">(</span>
          {t.url ? (
            <a href={t.url} target="_blank" rel="noreferrer" className="text-muted hover:text-text hover:underline">
              {t.arg}
            </a>
          ) : (
            <span className="text-muted">{t.arg}</span>
          )}
          <span className="text-muted">)</span>
        </span>
      </div>
      {t.result && (
        <div className="flex gap-2 pl-1.5">
          <span className="text-faint">⎿</span>
          <span className={`min-w-0 break-words ${t.status === "warn" ? "text-you" : t.status === "err" ? "text-danger" : "text-faint"}`}>{t.result}</span>
        </div>
      )}
    </div>
  );
}

function Thinking({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const tail = text.length > 420 ? "…" + text.slice(-420) : text;
  return (
    <div className="fade-in">
      <button onClick={() => setOpen((o) => !o)} className="flex gap-2 text-left">
        <span className="text-provider">✻</span>
        <span className="italic text-provider">
          {live ? "Thinking…" : "Thought"}{" "}
          <span className="not-italic text-faint">
            ({Math.round(text.length / 4).toLocaleString()} tokens · {open ? "collapse" : "expand"})
          </span>
        </span>
      </button>
      <div className={`mt-1 whitespace-pre-wrap border-l border-provider/30 pl-4 italic text-faint ${open ? "max-h-[50vh] overflow-y-auto" : "max-h-28 overflow-hidden"}`}>
        {open ? text : tail}
      </div>
    </div>
  );
}

const TRACK_ICON: Record<(typeof TODOS)[number]["id"], { label: string }> = {
  plan: { label: "plan" },
  read: { label: "read" },
  follow: { label: "follow" },
  probe: { label: "probe" },
  write: { label: "write" },
  check: { label: "check" },
};

/** The six stations of a run; the current one pulses and a pixel runs the track to the next. */
function Track({ idx, failed }: { idx: number; failed: boolean }) {
  return (
    <div className="border-b border-line bg-panel/70">
      <ol className="no-scrollbar mx-auto flex max-w-6xl items-start overflow-x-auto px-4 py-4 sm:px-6">
        {TODOS.map((s, i) => {
          const state = i < idx ? "done" : i === idx ? (failed ? "err" : "now") : "todo";
          return (
            <li key={s.id} className="flex min-w-[88px] flex-1 items-start last:flex-none" title={s.label}>
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={`relative flex h-10 w-10 items-center justify-center border-2 ${
                    state === "done"
                      ? "border-field bg-field text-[#f4fff6]"
                      : state === "now"
                        ? "border-accent bg-accent text-[#13221a] shadow-[0_0_0_4px_rgba(247,185,228,0.18)]"
                        : state === "err"
                          ? "border-danger text-danger"
                          : "border-line text-faint"
                  }`}
                >
                  <PixelIcon name={s.id} size={20} accent={state === "now" ? "var(--hot)" : "currentColor"} className={state === "now" ? "pulse-dot" : ""} />
                  {state === "done" && <span className="absolute -right-1.5 -top-1.5 bg-tested px-0.5 font-pixel text-[8px] leading-none text-[#13221a]">✓</span>}
                </span>
                <span className={`font-pixel text-[9px] ${state === "now" ? "text-accent" : state === "done" ? "text-text" : "text-faint"}`}>{TRACK_ICON[s.id].label}</span>
              </div>
              {i < TODOS.length - 1 && (
                <div className="relative mx-2 mt-[19px] h-[2px] flex-1 overflow-hidden">
                  <div className={`absolute inset-0 ${i < idx ? "bg-field" : "bg-[repeating-linear-gradient(90deg,var(--line)_0_4px,transparent_4px_8px)]"}`} />
                  {state === "now" && <span className="track-run absolute top-[-1px] h-1 w-1 bg-accent" />}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Every page and endpoint the agent touched, with how it went. */
function Sources({ tools, use }: { tools: Tool[]; use: Record<string, { claims: number; verified: number }> }) {
  const hits = tools.filter((t) => ["Read", "Recover", "Probe", "Fetch"].includes(t.name) && (t.url || t.arg));
  const judged = Object.keys(use).length > 0;
  const ok = hits.filter((t) => t.status === "ok").length;
  const bad = hits.filter((t) => t.status === "warn" || t.status === "err").length;
  return (
    <div className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="flex items-center gap-2 font-pixel text-[11px] text-accent">
          <PixelIcon name="read" size={13} accent="var(--hot)" /> sources
        </span>
        <span className="font-mono text-[10px] text-faint">
          <span className="text-tested">{ok} read</span>
          {bad ? <span className="text-you"> · {bad} dropped</span> : null}
        </span>
      </div>
      {judged && (
        <div className="border-b border-line px-3 py-1.5 font-mono text-[10px] text-faint">
          <span className="text-sourced">n</span> claims cite it · <span className="text-tested">n✓</span> quotes verified there
        </div>
      )}
      {hits.length === 0 ? (
        <div className="px-3 py-4 font-mono text-[11px] text-faint">nothing fetched yet…</div>
      ) : (
        <ul className="no-scrollbar max-h-[46vh] space-y-px overflow-y-auto overscroll-contain p-1.5">
          {hits.map((t) => {
            let host = t.arg;
            let path = "";
            try {
              const u = new URL(t.url ?? `https://${t.arg}`);
              host = u.hostname.replace(/^www\./, "");
              path = u.pathname.length > 1 ? u.pathname : "";
            } catch {}
            return (
              <li key={t.id} className="fade-in flex items-center gap-2 px-1.5 py-1 font-mono text-[11px] hover:bg-panel-2" title={t.result ?? t.arg}>
                <span
                  className={`h-2 w-2 shrink-0 ${t.status === "run" ? "pulse-dot bg-muted" : t.status === "ok" ? "bg-tested" : t.status === "warn" ? "bg-you" : "bg-danger"}`}
                />
                <span className={`shrink-0 ${t.name === "Recover" ? "text-agent" : "text-faint"}`}>
                  {t.name === "Probe" ? "probe" : t.name === "Fetch" ? "index" : t.name === "Recover" ? "found" : "read"}
                </span>
                <span className={`min-w-0 flex-1 truncate ${judged && t.status === "ok" && t.url && !use[t.url]?.claims && t.name !== "Probe" ? "opacity-45" : ""}`}>
                  <span className="text-text">{host}</span>
                  <span className="text-faint">{path}</span>
                </span>
                {t.url && use[t.url] ? (
                  use[t.url].claims ? (
                    <span className="shrink-0 border border-sourced/50 px-1 text-[10px] text-sourced" title={`${use[t.url].claims} claims cite this page · ${use[t.url].verified} quotes verified in it`}>
                      {use[t.url].claims}
                      {use[t.url].verified ? <span className="text-tested"> · {use[t.url].verified}✓</span> : null}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] text-faint">unused</span>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** How the finished guide's claims split across tested / sourced / inferred. */
function EvidenceMix({ g }: { g: Guide }) {
  const all = [...g.requirements, ...g.gotchas, ...g.scopes, ...g.blockers, ...g.steps, ...g.phases].map((x) => x.evidence);
  const n = all.length || 1;
  const parts = (["tested", "sourced", "inferred"] as const).map((e) => [e, all.filter((x) => x === e).length] as const);
  const color = { tested: "bg-tested", sourced: "bg-sourced", inferred: "bg-inferred/50" };
  return (
    <div className="mt-4">
      <div className="flex h-2.5 overflow-hidden">
        {parts.map(([e, c]) => (c ? <span key={e} className={color[e]} style={{ width: `${(c / n) * 100}%` }} /> : null))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 font-mono text-[11px]">
        {parts.map(([e, c]) => (
          <span key={e} className={e === "tested" ? "text-tested" : e === "sourced" ? "text-sourced" : "text-inferred"}>
            {c} {e}
          </span>
        ))}
        <span className="text-faint">of {all.length} claims</span>
      </div>
    </div>
  );
}
