"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Fact } from "@/lib/facts";
import type { AppSummary } from "@/lib/summary";
import { fmtHours } from "@/lib/time";
import { AnswerText, FactPeek, streamAsk } from "./answer";
import { Difficulty } from "./bits";
import { Handheld, type Cart } from "./Handheld";
import { PixelIcon, type IconName } from "./PixelIcon";

const TRY = ["Zoom", "HubSpot", "Dropbox", "Salesforce", "Spotify", "Strava", "figma.com"];

type Mode = "investigate" | "ask" | "compare";
type Command = { id: string; icon: IconName; desc: string; arg?: string; mode?: Mode };

// Typing "/" opens these. Mode commands change what the box does (shift+tab cycles them);
// the rest run straight away.
const COMMANDS: Command[] = [
  { id: "investigate", icon: "read", arg: "<app or site>", desc: "open its guide, or research it live", mode: "investigate" },
  { id: "ask", icon: "ask", arg: "<question>", desc: "ask anything about OAuth apps, answered from the guides", mode: "ask" },
  { id: "compare", icon: "versus", arg: "<app> <app>", desc: "gates and timelines side by side", mode: "compare" },
  { id: "play", icon: "game", desc: "pocket console: run an app's approval gates" },
  { id: "random", icon: "dice", desc: "open a random guide" },
  { id: "model", icon: "gear", desc: "choose the model or bring your own key" },
];
const MODES: Mode[] = ["investigate", "ask", "compare"];

const PLACEHOLDER: Record<Mode, string> = {
  investigate: "app name or website, or / for commands",
  ask: "anything about OAuth apps, e.g. which is fastest to ship?",
  compare: "two or three apps, e.g. gmail slack notion",
};

// Typed into the empty box one at a time, so people find the commands. Tab takes the tip.
const TIPS = [
  "/ask which app is fastest to ship?",
  "/compare gmail slack notion",
  "hubspot.com",
  "/ask can I skip Slack's review?",
  "/play",
  "/ask what is a CASA assessment?",
  "/random",
  "/ask do I need a privacy policy for LinkedIn?",
];

/** Library apps named in free text, in the order they appear. */
function findApps(text: string, apps: AppSummary[]): AppSummary[] {
  const t = ` ${text.toLowerCase()} `;
  const hits: [number, AppSummary][] = [];
  for (const a of apps) {
    const names = new Set([a.name.toLowerCase(), a.slug.replace(/-/g, " "), a.slug]);
    const first = a.name.toLowerCase().split(/\s+/)[0];
    if (first.length > 3) names.add(first);
    let at = -1;
    for (const n of names) {
      const m = new RegExp(`[^a-z0-9]${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:'s)?[^a-z0-9]`).exec(t);
      if (m && (at < 0 || m.index < at)) at = m.index;
    }
    if (at >= 0) hits.push([at, a]);
  }
  return hits.sort((x, y) => x[0] - y[0]).map(([, a]) => a);
}

type Turn = { q: string; text: string; model?: string; error?: boolean };
/** A chat with one guide (app) or with the whole library (app null). */
type Convo = { app: AppSummary | null; turns: Turn[]; facts: Map<string, Fact>; busy: boolean };
type Panel = { kind: "ask"; c: Convo } | { kind: "compare"; apps: AppSummary[] } | { kind: "note"; text: string };

/** Types each tip out, holds it, then moves on. Pauses while it isn't needed. */
function useTypedTip(active: boolean) {
  const [tip, setTip] = useState({ i: 0, n: 0 });
  useEffect(() => {
    if (!active) return;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    const id = setInterval(
      () =>
        setTip(({ i, n }) => {
          const len = TIPS[i].length;
          if (reduce) return { i: (i + 1) % TIPS.length, n: TIPS[(i + 1) % TIPS.length].length };
          if (n < len + 40) return { i, n: n + 1 }; // type, then hold ~2s
          return { i: (i + 1) % TIPS.length, n: 0 };
        }),
      reduce ? 3500 : 50,
    );
    return () => clearInterval(id);
  }, [active]);
  return TIPS[tip.i].slice(0, tip.n);
}

export function SearchBox({ apps, carts }: { apps: AppSummary[]; carts: Cart[] }) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<Mode>("investigate");
  const [sel, setSel] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [peek, setPeek] = useState<Fact | null>(null);
  const [play, setPlay] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const ctrl = useRef<AbortController | null>(null);
  const router = useRouter();

  // Focus mode: while you're typing, the rest of the page softly blurs back. Starts on a real
  // click or keystroke (not the page-load autofocus), ends on blur or Esc.
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("search-focus", focus);
    return () => document.documentElement.classList.remove("search-focus");
  }, [focus]);
  useEffect(() => () => ctrl.current?.abort(), []);

  const menuOpen = /^\/\S*$/.test(q);
  const matches = menuOpen ? COMMANDS.filter((c) => c.id.startsWith(q.slice(1).toLowerCase())) : [];
  const named = mode === "investigate" ? [] : findApps(q, apps);
  const convo = panel?.kind === "ask" ? panel.c : null;
  const tip = useTypedTip(mode === "investigate" && !q);

  const switchMode = (m: Mode) => {
    setMode(m);
    setQ("");
    setSel(0);
    input.current?.focus();
  };

  const go = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const slug = v.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\..*$/, "");
    if (apps.some((a) => a.origin === "curated" && a.slug === slug)) router.push(`/guides/${slug}`);
    else router.push(`/generate?q=${encodeURIComponent(v)}`);
  };

  const ask = async (question: string) => {
    const found = findApps(question, apps);
    const prev = panel?.kind === "ask" ? panel.c : null;
    // One app named: that guide. Several: a cross-library question. None: keep the current chat going.
    const app = found.length === 1 ? found[0] : found.length > 1 ? null : (prev?.app ?? null);
    const same = prev && !prev.busy && (prev.app?.slug ?? null) === (app?.slug ?? null);
    ctrl.current?.abort();
    const ac = new AbortController();
    ctrl.current = ac;
    setPeek(null);
    setQ("");
    let c: Convo = same ? { ...prev, turns: [...prev.turns, { q: question, text: "" }], busy: true } : { app, turns: [{ q: question, text: "" }], facts: new Map(), busy: true };
    const history = c.turns.filter((t) => !t.error).flatMap((t, i, all) => (i < all.length - 1 ? [{ role: "user" as const, content: t.q }, { role: "assistant" as const, content: t.text }] : [{ role: "user" as const, content: t.q }]));
    const put = (patch: Partial<Convo>, turn?: Partial<Turn>) => {
      c = { ...c, ...patch, turns: turn ? [...c.turns.slice(0, -1), { ...c.turns[c.turns.length - 1], ...turn }] : c.turns };
      if (!ac.signal.aborted) setPanel({ kind: "ask", c });
    };
    put({});
    try {
      await streamAsk(
        { slug: app?.slug, messages: history.slice(-10), withFacts: !c.facts.size },
        {
          facts: (f) => put({ facts: new Map(f.map((x) => [x.id, x])) }),
          delta: (v) => put({}, { text: c.turns[c.turns.length - 1].text + v }),
          done: (model) => put({}, { model }),
        },
        ac.signal,
      );
      put({ busy: false });
    } catch (err) {
      put({ busy: false }, { text: (err as Error).message, error: true });
    }
  };

  const run = (c: Command, rest = "") => {
    setQ("");
    setSel(0);
    if (c.mode) {
      setMode(c.mode);
      if (rest) submit(c.mode, rest);
      else input.current?.focus();
      return;
    }
    if (c.id === "play") setPlay(true);
    else if (c.id === "random") {
      const pool = apps.filter((a) => a.origin === "curated");
      router.push(`/guides/${pool[Math.floor(Math.random() * pool.length)].slug}`);
    } else if (c.id === "model") window.dispatchEvent(new Event("oauthready:model"));
  };

  const submit = (m: Mode, raw: string) => {
    const text = raw.trim();
    if (!text) return;
    // "/ask how long is gmail's review" works in one go.
    const typed = /^\/(\w+)\s*(.*)$/.exec(text);
    if (typed) {
      const c = COMMANDS.find((x) => x.id === typed[1].toLowerCase()) ?? (menuOpen ? matches[sel] : undefined);
      if (c) run(c, typed[2]);
      else setPanel({ kind: "note", text: `No command “/${typed[1]}”. Type / to see them.` });
      return;
    }
    if (m === "investigate") return go(text);
    if (m === "ask") return void ask(text);
    const found = findApps(text, apps);
    if (found.length < 2) {
      setPanel({ kind: "note", text: `Name two or three library apps to compare${found.length ? ` (found ${found[0].name})` : ""}.` });
      return;
    }
    setQ("");
    setPanel({ kind: "compare", apps: found.slice(0, 3) });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setFocus(true);
    if (menuOpen && matches.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => (s + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        run(matches[Math.min(sel, matches.length - 1)]);
        return;
      }
    }
    if (e.key === "Tab" && !e.shiftKey && !q && mode === "investigate" && tip) {
      e.preventDefault();
      const full = TIPS.find((t) => t.startsWith(tip)) ?? tip;
      setQ(full);
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      switchMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
    } else if (e.key === "Backspace" && !q && mode !== "investigate") {
      switchMode("investigate");
    } else if (e.key === "Escape") {
      if (q.startsWith("/")) setQ("");
      else e.currentTarget.blur();
    }
  };

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(mode, q);
        }}
        className="flex overflow-hidden border-2 border-[#13221a] bg-[#0d1611] shadow-[4px_4px_0_#13221a] transition-[box-shadow,transform] duration-300 focus-within:border-accent focus-within:shadow-[6px_6px_0_#f7b9e4] focus-within:-translate-x-px focus-within:-translate-y-px"
      >
        {mode === "investigate" ? (
          <span className="flex items-center pl-4 font-mono text-accent">$</span>
        ) : (
          <button
            type="button"
            key={mode}
            onClick={() => switchMode("investigate")}
            title="Back to investigate (backspace)"
            className="chip-pop my-2 ml-2 flex items-center gap-1.5 bg-accent px-2 font-pixel text-[10px] text-[#13221a] hover:bg-white"
          >
            <PixelIcon name={mode === "ask" ? "ask" : "versus"} size={12} accent="var(--hot)" />
            {mode}
          </button>
        )}
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onPointerDown={() => setFocus(true)}
          onKeyDown={onKeyDown}
          onBlur={() => setFocus(false)}
          placeholder={mode === "investigate" && tip ? `try ${tip}` : mode === "ask" && convo ? `follow up${convo.app ? ` on ${convo.app.name}` : ""}, or name another app` : PLACEHOLDER[mode]}
          aria-label={`Search box, ${mode} mode. Type / for commands.`}
          role="combobox"
          aria-expanded={menuOpen}
          aria-controls="search-commands"
          className="min-w-0 flex-1 bg-transparent px-3 py-3.5 font-mono text-sm outline-none placeholder:text-faint"
          maxLength={mode === "ask" ? 300 : 120}
          autoFocus
        />
        <button aria-label={mode} className="bg-accent px-4 font-pixel text-sm text-[#13221a] hover:bg-white sm:px-5">
          <span className="hidden sm:inline">{menuOpen ? "run" : mode} </span>→
        </button>
      </form>

      {/* Slash menu: renders in flow (the hero clips overflow), like a terminal's completion list. */}
      {menuOpen && (
        <div id="search-commands" role="listbox" className="fade-in mt-2 border-2 border-[#13221a] bg-[#0d1611] py-1 shadow-[4px_4px_0_#13221a]">
          {matches.length ? (
            matches.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={i === sel}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setSel(i)}
                onClick={() => run(c)}
                className={`group flex w-full items-center gap-3 px-3 py-1.5 text-left font-mono text-[12px] ${i === sel ? "bg-accent text-[#13221a]" : "text-white/85"}`}
              >
                <PixelIcon name={c.icon} size={14} accent={i === sel ? "var(--hot)" : "var(--accent)"} />
                <span className="w-24 shrink-0 font-semibold">/{c.id}</span>
                <span className={`hidden w-28 shrink-0 sm:inline ${i === sel ? "text-[#13221a]/60" : "text-faint"}`}>{c.arg ?? ""}</span>
                <span className={`min-w-0 truncate ${i === sel ? "" : "text-muted"}`}>{c.desc}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-1.5 font-mono text-[12px] text-faint">no command “{q}”</div>
          )}
          <div className="mt-1 border-t border-line px-3 pt-1.5 font-mono text-[10px] text-faint">↑↓ choose · tab / enter run · esc close</div>
        </div>
      )}

      {/* What the box will do with what you've typed */}
      {!menuOpen && (
        <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-white/75">
          {mode === "investigate" ? (
            <>
              <span>try one outside the library:</span>
              {TRY.map((t) => (
                <button key={t} type="button" onClick={() => go(t)} className="border border-white/40 bg-black/10 px-2 py-0.5 text-white hover:border-accent hover:bg-accent hover:text-[#13221a]">
                  {t}
                </button>
              ))}
            </>
          ) : mode === "ask" ? (
            <>
              {named.length === 1 ? (
                <>
                  <span>answering from</span>
                  <span className="bg-accent px-2 py-0.5 text-[#13221a]">{named[0].name}</span>
                  <span className="text-white/60">guide</span>
                </>
              ) : named.length > 1 ? (
                <>
                  <span>answering across the library:</span>
                  <span className="bg-accent px-2 py-0.5 text-[#13221a]">{named.map((a) => a.name).join(" vs ")}</span>
                </>
              ) : convo ? (
                <span>
                  follow-up to your {convo.app ? `${convo.app.name} guide` : "library"} chat · name an app to switch
                </span>
              ) : (
                <>
                  <span>answering from the whole library · or about one app:</span>
                  {apps.slice(0, 6).map((a) => (
                    <button
                      key={a.slug}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setQ((v) => (v.trim() ? `${v.trimEnd()} (${a.name})` : `What's the hardest part of ${a.name}?`))}
                      className="border border-white/40 bg-black/10 px-2 py-0.5 text-white hover:border-accent hover:bg-accent hover:text-[#13221a]"
                    >
                      {a.name}
                    </button>
                  ))}
                </>
              )}
            </>
          ) : named.length ? (
            <>
              <span>comparing</span>
              {named.slice(0, 3).map((a, i) => (
                <span key={a.slug} className="flex items-center gap-2">
                  {i > 0 && <span className="text-accent">vs</span>}
                  <span className="bg-accent px-2 py-0.5 text-[#13221a]">{a.name}</span>
                </span>
              ))}
            </>
          ) : (
            <>
              <span>pick apps:</span>
              {apps.slice(0, 8).map((a) => (
                <button
                  key={a.slug}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setQ((v) => `${v.trimEnd()} ${a.name}`.trimStart())}
                  className="border border-white/40 bg-black/10 px-2 py-0.5 text-white hover:border-accent hover:bg-accent hover:text-[#13221a]"
                >
                  {a.name}
                </button>
              ))}
            </>
          )}
          <span className="ml-auto hidden text-white/55 sm:inline">
            {mode === "investigate" && !q && (
              <>
                <kbd className="border border-white/30 px-1">tab</kbd> use tip ·{" "}
              </>
            )}
            <kbd className="border border-white/30 px-1">/</kbd> commands · <kbd className="border border-white/30 px-1">⇧tab</kbd> mode
          </span>
        </div>
      )}

      {panel && (
        <div className="fade-in relative mt-4 border-2 border-[#13221a] bg-[#0d1611] shadow-[4px_4px_0_#13221a]">
          <button
            type="button"
            onClick={() => {
              ctrl.current?.abort();
              setPanel(null);
              setPeek(null);
            }}
            aria-label="Close"
            className="absolute right-2.5 top-2 z-10 font-pixel text-[10px] text-faint hover:text-text"
          >
            ✕
          </button>
          {panel.kind === "ask" && <AskPanel c={panel.c} peek={peek} setPeek={setPeek} />}
          {panel.kind === "compare" && <ComparePanel apps={panel.apps} />}
          {panel.kind === "note" && <p className="px-4 py-3 pr-10 font-mono text-[12px] text-muted">{panel.text}</p>}
        </div>
      )}

      {play && <PlayOverlay carts={carts} onClose={() => setPlay(false)} />}
    </div>
  );
}

function AskPanel({ c, peek, setPeek }: { c: Convo; peek: Fact | null; setPeek: (f: Fact | null) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const source = c.app ? `${c.app.name} guide` : "whole library";
  const last = c.turns[c.turns.length - 1];
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [last.text, c.turns.length]);
  return (
    <div className="p-4 pr-8">
      <div className="flex items-center gap-2 font-pixel text-[10px] text-accent">
        <PixelIcon name="ask" size={12} accent="var(--hot)" />
        ask · {source}
      </div>
      <div ref={list} className="no-scrollbar max-h-[420px] space-y-4 overflow-y-auto overscroll-contain">
        {c.turns.map((t, i) => (
          <div key={i}>
            <p className="mt-2 font-mono text-[12px] text-faint">› {t.q}</p>
            <div className={`mt-2 text-[14px] leading-relaxed ${t.error ? "text-danger" : "text-text/90"}`}>
              {t.text ? <AnswerText text={t.text} facts={c.facts} onPeek={setPeek} /> : <span className="shimmer font-mono text-xs">reading the {source}…</span>}
              {c.busy && i === c.turns.length - 1 && t.text && <span className="caret" />}
            </div>
          </div>
        ))}
      </div>
      {peek && <FactPeek fact={peek} onClose={() => setPeek(null)} className="mt-3" />}
      {!c.busy && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 font-mono text-[10px] text-faint">
          <span>{last.model ? `${last.model} · grounded in the ${source} · click a chip for its source` : ""}</span>
          {c.app ? (
            <Link href={`/guides/${c.app.slug}`} className="text-accent hover:text-white">
              open the guide →
            </Link>
          ) : (
            <span>type a follow-up above</span>
          )}
        </div>
      )}
    </div>
  );
}

function ComparePanel({ apps }: { apps: AppSummary[] }) {
  const rows: [string, (a: AppSummary) => React.ReactNode][] = [
    ["verdict", (a) => <span className="tag-pixel text-[10px]">{a.label}</span>],
    ["difficulty", (a) => <Difficulty level={a.difficulty} size="sm" />],
    ["first connection", (a) => a.timeToDev],
    ["production", (a) => a.timeToProd],
    ["worst-case wait", (a) => (a.wait ? `up to ${fmtHours(a.wait)}` : "none")],
    ["Composio managed app", (a) => (a.managed === null ? "unknown" : a.managed ? (a.wait > 24 ? "yes, skip the wait" : "yes") : "no")],
  ];
  const easiest = [...apps].sort((x, y) => x.prod[1] - y.prod[1])[0];
  return (
    <div className="p-4 pr-8">
      <div className="flex items-center gap-2 font-pixel text-[10px] text-accent">
        <PixelIcon name="versus" size={12} accent="var(--hot)" />
        compare
      </div>
      <div className="no-scrollbar mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse font-mono text-[11px]">
          <thead>
            <tr>
              <th className="w-32" />
              {apps.map((a) => (
                <th key={a.slug} className="pb-2 text-left font-sans text-[15px] font-semibold text-text">
                  <Link href={`/guides/${a.slug}`} className="hover:text-accent">
                    {a.name}
                  </Link>
                  {a.origin === "agent" && <span className="ml-1.5 font-pixel text-[8px] text-agent">agent</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, cell]) => (
              <tr key={label} className="border-t border-line/70 align-top">
                <td className="py-1.5 pr-3 text-faint">{label}</td>
                {apps.map((a) => (
                  <td key={a.slug} className="py-1.5 pr-3 text-text/90">
                    {cell(a)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 border-t border-line pt-2 font-mono text-[11px] text-muted">
        Fastest to production: <span className="text-accent">{easiest.name}</span>, up to {fmtHours(easiest.prod[1])} end to end.
      </p>
    </div>
  );
}

function PlayOverlay({ carts, onClose }: { carts: Cart[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    box.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return createPortal(
    <div onClick={onClose} className="fade-in fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/75 backdrop-blur-sm">
      <div ref={box} onClick={(e) => e.stopPropagation()} className="origin-center scale-[1.25] sm:scale-[1.45] [@media(max-height:760px)]:!scale-100">
        <Handheld carts={carts} />
      </div>
      <p className="font-pixel text-[10px] text-white/70">esc or tap outside to close</p>
    </div>,
    document.body,
  );
}
