"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Fact } from "@/lib/facts";
import { summarize, type AppSummary } from "@/lib/summary";
import { fmtHours } from "@/lib/time";
import type { AgentEvent } from "@/lib/types";
import { AnswerText, CopyButton, FactPeek, RichText, streamAsk, streamChat, type ChatMsg, type ChatTool } from "./answer";
import { Difficulty } from "./bits";
import { Handheld, type Cart } from "./Handheld";
import { streamAgent } from "./agentStream";
import { loadByo } from "./ModelSettings";
import { PixelIcon, type IconName } from "./PixelIcon";
import { WaitChart } from "./WaitChart";

const TRY = ["Zoom", "HubSpot", "Dropbox", "Salesforce", "Spotify", "Strava", "figma.com"];

type Mode = "investigate" | "ask" | "compare" | "chat";
type Command = { id: string; icon: IconName; desc: string; arg?: string; mode?: Mode };

// Typing "/" opens these. Mode commands change what the box does (shift+tab cycles them);
// the rest run straight away.
const COMMANDS: Command[] = [
  { id: "investigate", icon: "read", arg: "<app or site>", desc: "open its guide, or research it live", mode: "investigate" },
  { id: "ask", icon: "ask", arg: "<question>", desc: "OAuth questions, answered from the guides with citations", mode: "ask" },
  { id: "compare", icon: "versus", arg: "<app> <app>", desc: "side by side; fixes typos, researches new apps live", mode: "compare" },
  { id: "chat", icon: "chat", arg: "<anything>", desc: "open chat about anything, with optional web search", mode: "chat" },
  { id: "play", icon: "game", desc: "pocket console: run an app's approval gates" },
  { id: "random", icon: "dice", desc: "open a random guide" },
  { id: "model", icon: "gear", desc: "choose the model or bring your own key" },
  { id: "clear", icon: "cross", desc: "start a new chat, close the answer" },
];
const MODES: Mode[] = ["investigate", "ask", "compare", "chat"];
const MODE_ICON: Record<Mode, IconName> = { investigate: "read", ask: "ask", compare: "versus", chat: "chat" };

const PLACEHOLDER: Record<Mode, string> = {
  investigate: "app name or website, or / for commands",
  ask: "anything about OAuth apps, e.g. which is fastest to ship?",
  compare: "two or three apps, typos are fine, e.g. gmial vs zendesk",
  chat: "anything at all: code, writing, ideas. shift+enter for a new line",
};

// Typed into the empty box one at a time, so people find the commands. Tab takes the tip.
const TIPS = [
  "/ask which app is fastest to ship?",
  "/compare gmial vs zendesk",
  "hubspot.com",
  "/chat explain PKCE like I'm five",
  "/ask can I skip Slack's review?",
  "/play",
  "/compare slack notion github",
  "/chat draft a note to Google asking about CASA",
  "/random",
  "/ask do I need a privacy policy for LinkedIn?",
];

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameRe = (n: string, flags = "") => new RegExp(`(?<=[^a-z0-9])${escRe(n)}(?:'s)?(?=[^a-z0-9])`, flags);

/** Ways an app might be written: its name, its slug, and a distinctive first word. */
function namesOf(a: AppSummary): string[] {
  const names = new Set([a.name.toLowerCase(), a.slug.replace(/-/g, " "), a.slug]);
  const first = a.name.toLowerCase().split(/\s+/)[0];
  if (first.length > 3) names.add(first);
  return [...names];
}

/** Library apps named in free text, in the order they appear. */
function findApps(text: string, apps: AppSummary[]): AppSummary[] {
  const t = ` ${text.toLowerCase()} `;
  const hits: [number, AppSummary][] = [];
  for (const a of apps) {
    let at = -1;
    for (const n of namesOf(a)) {
      const m = nameRe(n).exec(t);
      if (m && (at < 0 || m.index < at)) at = m.index;
    }
    if (at >= 0) hits.push([at, a]);
  }
  return hits.sort((x, y) => x[0] - y[0]).map(([, a]) => a);
}

/** Words of a compare query that aren't library apps or joining words: typos, or apps to research. */
function leftover(text: string, found: AppSummary[]): string[] {
  let t = ` ${text.toLowerCase()} `;
  for (const a of found) for (const n of namesOf(a).sort((x, y) => y.length - x.length)) t = t.replace(nameRe(n, "g"), " ");
  return t
    .replace(/\b(vs|versus|and|or|with|compare|comparing|between|against|to|the|which|is|easier|faster)\b|[^a-z0-9.\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]{2,}/.test(w));
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return d[b.length];
}

/** Closest library app to a misspelt word. Only used when the AI resolver can't be reached. */
function fuzzyApp(word: string, apps: AppSummary[]): AppSummary | undefined {
  let best: [number, AppSummary] | undefined;
  for (const a of apps)
    for (const n of namesOf(a)) {
      const d = lev(word, n);
      if (d <= (n.length >= 7 ? 2 : 1) && (!best || d < best[0])) best = [d, a];
    }
  return best?.[1];
}

const ASKY = /^(how|what|why|which|when|where|who|can|could|do|does|did|is|are|should|will|would|explain|tell|help|write|give|list|show|make|draft)\b/i;
const OAUTHY = /\b(oauth|scopes?|review|approv\w*|verif\w*|tokens?|api|apps?|integrat\w*|casa|consent|redirect|client|marketplace|publish\w*|sso|pkce|refresh|webhooks?|permissions?)\b/i;

/**
 * Task mode: what Enter does with plain text in the default box. An app name or site opens its
 * guide (or the agent); a comparison, a question or any other task goes to the mode that does it,
 * so a sentence is never sent to the agent as if it were an app name.
 */
function intent(text: string, apps: AppSummary[]): { mode: Mode; text: string } {
  const t = text.trim();
  const verb = /^(?:research|investigate|look ?up|guide (?:for|to)|open)\s+(.+)$/i.exec(t);
  if (verb) return { mode: "investigate", text: verb[1] };
  const found = findApps(t, apps);
  if (/\b(vs\.?|versus|compare|comparing)\b/i.test(t) || (found.length >= 2 && !ASKY.test(t) && !/\?\s*$/.test(t))) return { mode: "compare", text: t };
  if (!/\?\s*$/.test(t) && !ASKY.test(t) && t.split(/\s+/).length < 5) return { mode: "investigate", text: t };
  return { mode: found.length || OAUTHY.test(t) ? "ask" : "chat", text: t };
}

const ROUTE: Record<Mode, string> = { investigate: "", ask: "answers it from the guides, with citations", compare: "compares them side by side", chat: "opens a chat about it" };

/** Run the live agent for one app (or fetch its cached guide), feeding its events to `on`. */
async function research(query: string, signal: AbortSignal, on: (e: AgentEvent) => void) {
  let finished = false;
  let failed: string | null = null;
  await streamAgent(
    query,
    {},
    (e) => {
      if (e.type === "error") failed = e.message;
      else {
        if (e.type === "done") finished = true;
        on(e);
      }
    },
    signal,
  );
  if (failed) throw new Error(failed);
  if (!finished && !signal.aborted) throw new Error("the agent stopped before finishing");
}

type Turn = { q: string; text: string; model?: string; error?: boolean };
/** A chat with one guide (app) or with the whole library (app null). */
type Convo = { app: AppSummary | null; turns: Turn[]; facts: Map<string, Fact>; busy: boolean };
type ChatTurn = { q: string; text: string; thought: string; t0: number; th0?: number; thinkMs?: number; tools?: ChatTool[]; model?: string; error?: string; stopped?: boolean };
type Chat = { turns: ChatTurn[]; busy: boolean };
type Live = { verb: string; detail?: string; tokens: number; t0: number; t1?: number; error?: string };
/** One app in a comparison: from the library, or researched live by the agent. */
type Slot = { typed: string; name: string; app?: AppSummary; live?: Live };
type Cmp = { stage: "reading" | "researching" | "ready"; text: string; slots: Slot[]; t0: number; model?: string; note?: string };
type Panel = { kind: "ask"; c: Convo } | { kind: "compare"; s: Cmp } | { kind: "chat" } | { kind: "note"; text: string };

const GLYPHS = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

/** Claude Code–style working line: a spinning glyph, a shimmering verb and the elapsed time. */
function Working({ verb, t0, extra }: { verb: string; t0: number; extra?: string }) {
  const [now, setNow] = useState(t0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="inline-flex min-w-0 items-baseline gap-2 font-mono text-[12px]">
      <span className="w-3 shrink-0 text-accent">{GLYPHS[Math.floor(now / 120) % GLYPHS.length]}</span>
      <span className="shimmer shrink-0">{verb}…</span>
      <span className="truncate text-faint">
        ({Math.max(0, Math.floor((now - t0) / 1000))}s{extra ? ` · ${extra}` : ""})
      </span>
    </span>
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

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
  const [chatLog, setChatLog] = useState<Chat>({ turns: [], busy: false });
  const [peek, setPeek] = useState<Fact | null>(null);
  const [play, setPlay] = useState(false);
  // With an answer open, the command menu floats over it instead of pushing it down and back.
  const [floatMenu, setFloatMenu] = useState(false);
  // Chat searches the web only when you turn it on; remembered per browser.
  const [webSearch, setWebSearch] = useState(false);
  useEffect(() => {
    try {
      setWebSearch(localStorage.getItem("oauthready:websearch") === "1");
    } catch {}
  }, []);
  const toggleSearch = () =>
    setWebSearch((on) => {
      try {
        localStorage.setItem("oauthready:websearch", on ? "0" : "1");
      } catch {}
      return !on;
    });
  const input = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const ctrl = useRef<AbortController | null>(null);
  const router = useRouter();

  // Spotlight: while you're using the box the rest of the page softly blurs back and, on wider
  // screens, the box glides to the middle of the screen, a little above centre, like a command
  // palette. Starts on a real click or keystroke (not the page-load autofocus). Ends on a click
  // outside it, Esc, or tabbing away, so clicking inside an answer doesn't send it back.
  const [focus, setFocus] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.classList.toggle("search-focus", focus);
    return () => document.documentElement.classList.remove("search-focus");
  }, [focus]);
  useEffect(() => () => ctrl.current?.abort(), []);
  useEffect(() => {
    if (!focus) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setFocus(false);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [focus]);

  // The glide is a transform on the inner stage (GPU-only, nothing reflows), measured from the
  // untransformed outer box, so it's one smooth motion out and the exact path back.
  useEffect(() => {
    const outer = box.current;
    const el = stage.current;
    if (!outer || !el) return;
    const place = () => {
      let wide = false;
      try {
        wide = window.matchMedia("(min-width: 640px)").matches;
      } catch {}
      if (!focus || !wide) {
        el.style.transform = "";
        return;
      }
      const r = outer.getBoundingClientRect();
      const x = window.innerWidth / 2 - (r.left + r.width / 2);
      // Only ever up: the hero clips its overflow, so moving down could cut off an answer.
      const y = Math.min(0, Math.max(96, window.innerHeight * 0.2) - r.top);
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    };
    place();
    if (!focus) return;
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [focus]);

  // Give the box room on a phone, where it doesn't glide: scroll it up under the nav when you
  // start typing (before the keyboard crushes it against the bottom), and on any screen when an
  // answer opens or the command menu would run off the bottom while it isn't in the spotlight.
  const lift = useCallback(() => {
    const el = box.current;
    if (!el || stage.current?.style.transform || el.getBoundingClientRect().top < window.innerHeight * 0.25) return;
    let smooth = true;
    try {
      smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  }, []);
  useEffect(() => {
    if (!focus) return;
    let phone = false;
    try {
      phone = window.matchMedia("(max-width: 639px)").matches;
    } catch {}
    if (!phone) return;
    const id = setTimeout(lift, 250); // after the keyboard starts to open
    return () => clearTimeout(id);
  }, [focus, lift]);
  const opened = panel?.kind ?? null;
  useEffect(() => {
    if (opened) lift();
  }, [opened, lift]);
  const menuOpen = /^\/\S*$/.test(q);
  useEffect(() => {
    const m = menuOpen && document.getElementById("search-commands");
    if (m && m.getBoundingClientRect().bottom > window.innerHeight) lift();
  }, [menuOpen, lift]);

  // The box is a textarea so chat can take multi-line messages; it grows with what's typed.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    // Empty, it stays one line: a long placeholder shouldn't grow the box.
    if (q) el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [q, mode]);

  const matches = menuOpen ? COMMANDS.filter((c) => c.id.startsWith(q.slice(1).toLowerCase())) : [];
  const named = mode === "ask" || mode === "compare" ? findApps(q, apps) : [];
  const unknown = mode === "compare" && !menuOpen ? leftover(q, named) : [];
  const convo = panel?.kind === "ask" ? panel.c : null;
  const routed = mode === "investigate" && q.trim() && !q.startsWith("/") ? intent(q, apps) : null;
  const tip = useTypedTip(mode === "investigate" && !q);
  const busy = (panel?.kind === "chat" && chatLog.busy) || (panel?.kind === "ask" && panel.c.busy) || (panel?.kind === "compare" && panel.s.stage !== "ready");

  /** Interrupt whatever is streaming (Esc), keeping what has arrived so far. */
  const stop = useCallback(() => {
    ctrl.current?.abort();
    setChatLog((c) => (c.busy ? { busy: false, turns: c.turns.map((t, i) => (i === c.turns.length - 1 ? { ...t, stopped: true } : t)) } : c));
    setPanel((p) =>
      p?.kind === "ask" && p.c.busy
        ? { kind: "ask", c: { ...p.c, busy: false } }
        : p?.kind === "compare" && p.s.stage !== "ready"
          ? { kind: "compare", s: { ...p.s, stage: "ready", slots: p.s.slots.map((x) => (x.live && !x.app && !x.live.error ? { ...x, live: { ...x.live, error: "interrupted" } } : x)) } }
          : p,
    );
  }, []);

  // Esc interrupts from anywhere on the page, like Claude Code; with nothing running, it ends
  // the spotlight (the box handles its own Esc).
  useEffect(() => {
    if (play || (!busy && !focus)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (busy) stop();
      else if (document.activeElement !== input.current) setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, focus, play, stop]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setQ("");
    setSel(0);
    if (m === "chat" && chatLog.turns.length && panel?.kind !== "chat") setPanel({ kind: "chat" });
    input.current?.focus();
  };

  const go = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const slug = v
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\..*$/, "");
    if (apps.some((a) => a.origin === "curated" && a.slug === slug)) router.push(`/guides/${slug}`);
    else router.push(`/generate?q=${encodeURIComponent(v)}`);
  };

  const ask = async (question: string) => {
    const found = findApps(question, apps);
    const prev = panel?.kind === "ask" ? panel.c : null;
    // One app named: that guide. Several: a cross-library question. None: keep the current chat going.
    const app = found.length === 1 ? found[0] : found.length > 1 ? null : (prev?.app ?? null);
    const same = prev && !prev.busy && (prev.app?.slug ?? null) === (app?.slug ?? null);
    stop();
    const ac = new AbortController();
    ctrl.current = ac;
    setPeek(null);
    setQ("");
    let c: Convo = same ? { ...prev, turns: [...prev.turns, { q: question, text: "" }], busy: true } : { app, turns: [{ q: question, text: "" }], facts: new Map(), busy: true };
    const history = c.turns
      .filter((t) => !t.error)
      .flatMap((t, i, all) =>
        i < all.length - 1
          ? [
              { role: "user" as const, content: t.q },
              { role: "assistant" as const, content: t.text },
            ]
          : [{ role: "user" as const, content: t.q }],
      );
    const put = (patch: Partial<Convo>, turn?: Partial<Turn>) => {
      c = { ...c, ...patch, turns: turn ? [...c.turns.slice(0, -1), { ...c.turns[c.turns.length - 1], ...turn }] : c.turns };
      if (!ac.signal.aborted) setPanel({ kind: "ask", c });
    };
    put({});
    try {
      await streamAsk(
        { slug: app?.slug, messages: history.slice(-10), withFacts: !c.facts.size },
        { facts: (f) => put({ facts: new Map(f.map((x) => [x.id, x])) }), delta: (v) => put({}, { text: c.turns[c.turns.length - 1].text + v }), done: (model) => put({}, { model }) },
        ac.signal,
      );
      put({ busy: false });
    } catch (err) {
      put({ busy: false }, { text: (err as Error).message, error: true });
    }
  };

  /** Open chat: anything goes. Keeps the whole conversation; `retry` replaces the last reply. */
  const chat = async (question: string, retry = false) => {
    stop();
    const ac = new AbortController();
    ctrl.current = ac;
    setPeek(null);
    setQ("");
    const prior = chatLog.turns.map((t, i) => (chatLog.busy && i === chatLog.turns.length - 1 ? { ...t, stopped: true } : t));
    let c: Chat = { busy: true, turns: [...(retry ? prior.slice(0, -1) : prior), { q: question, text: "", thought: "", t0: Date.now() }] };
    const history: ChatMsg[] = c.turns.flatMap((t, i): ChatMsg[] =>
      i === c.turns.length - 1
        ? [{ role: "user", content: t.q }]
        : t.text && !t.error
          ? [
              { role: "user", content: t.q },
              { role: "assistant", content: t.text },
            ]
          : [],
    );
    const last = () => c.turns[c.turns.length - 1];
    const put = (turn: Partial<ChatTurn>, stillBusy = true) => {
      c = { busy: stillBusy, turns: [...c.turns.slice(0, -1), { ...last(), ...turn }] };
      if (!ac.signal.aborted) setChatLog(c);
    };
    setChatLog(c);
    setPanel({ kind: "chat" });
    try {
      await streamChat(
        history.slice(-20),
        webSearch,
        {
          tool: (x) => put({ tools: [...(last().tools ?? []).filter((y) => y.id !== x.id), x].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1))) }),
          thought: (v) => put({ thought: last().thought + v, th0: last().th0 ?? Date.now() }),
          delta: (v) => put({ text: last().text + v, thinkMs: last().thinkMs ?? Date.now() - (last().th0 ?? last().t0) }),
          done: (model) => put({ model }),
        },
        ac.signal,
      );
      put({}, false);
    } catch (err) {
      put({ error: (err as Error).message }, false);
    }
  };

  /**
   * Compare: exact library names compare instantly. Anything else (typos, nicknames, apps not
   * in the library) goes to the AI resolver, and apps it can't find a guide for are researched
   * live by the agent, in parallel, then dropped into the table and chart as they finish.
   */
  const compare = async (text: string) => {
    stop();
    setQ("");
    setPeek(null);
    const exact = findApps(text, apps);
    const rest = leftover(text, exact);
    if (exact.length >= 2 && !rest.length) {
      setPanel({ kind: "compare", s: { stage: "ready", text, t0: Date.now(), slots: exact.slice(0, 3).map((a) => ({ typed: a.name, name: a.name, app: a })) } });
      return;
    }
    const ac = new AbortController();
    ctrl.current = ac;
    let s: Cmp = { stage: "reading", text, slots: [], t0: Date.now() };
    const put = (patch: Partial<Cmp>) => {
      s = { ...s, ...patch };
      if (!ac.signal.aborted) setPanel({ kind: "compare", s });
    };
    const putSlot = (i: number, patch: Partial<Slot>) => put({ slots: s.slots.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
    put({});

    let picked: { typed: string; name: string; slug: string | null }[];
    try {
      const res = await fetch("/api/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, byo: loadByo() }), signal: ac.signal });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      picked = j.apps;
      s.model = j.model;
    } catch {
      if (ac.signal.aborted) return;
      // Resolver unreachable: match by spelling distance, and research whatever's left as typed.
      const seen = new Set<string>();
      picked = [
        ...exact.map((a) => ({ typed: a.name, name: a.name, slug: a.slug })),
        ...rest.map((w) => {
          const a = fuzzyApp(w, apps);
          return a ? { typed: w, name: a.name, slug: a.slug } : { typed: w, name: w, slug: null };
        }),
      ].filter((p) => !seen.has(p.slug ?? p.name) && seen.add(p.slug ?? p.name));
      s.note = "Couldn't reach the model to read your list, so names were matched by spelling.";
    }

    const slots: Slot[] = picked.slice(0, 3).map((p) => {
      const app = apps.find((a) => a.slug === p.slug);
      return app ? { typed: p.typed, name: app.name, app } : { typed: p.typed, name: p.name, live: { verb: "Starting the agent", tokens: 0, t0: Date.now() } };
    });
    if (slots.length < 2) {
      setPanel({
        kind: "note",
        text: slots.length ? `Only found ${slots[0].name} in “${text}”. Name at least two apps to compare.` : `Couldn't find apps in “${text}”. Try something like gmail vs zendesk.`,
      });
      return;
    }
    put({ slots, stage: slots.some((x) => !x.app) ? "researching" : "ready" });

    await Promise.all(
      slots.map(async (slot, i) => {
        if (slot.app) return;
        const live = () => s.slots[i].live!;
        try {
          await research(slot.name, ac.signal, (e) => {
            if (e.type === "status") putSlot(i, { live: { ...live(), verb: e.verb } });
            else if (e.type === "step") putSlot(i, { live: { ...live(), verb: e.label } });
            else if (e.type === "tool" && e.status === "run") putSlot(i, { live: { ...live(), detail: `${e.name} ${e.arg}` } });
            else if (e.type === "log") putSlot(i, { live: { ...live(), detail: e.text } });
            else if (e.type === "usage") putSlot(i, { live: { ...live(), tokens: e.tokens } });
            else if (e.type === "identified") putSlot(i, { name: e.name });
            else if (e.type === "done") putSlot(i, { name: e.guide.name, app: summarize(e.guide), live: { ...live(), t1: Date.now() } });
          });
        } catch (err) {
          if (!ac.signal.aborted) putSlot(i, { live: { ...live(), error: (err as Error).message, t1: Date.now() } });
        }
      }),
    );
    if (ac.signal.aborted) return;
    put({ stage: "ready" });
    // New guides now exist: refresh the library list and the wait chart below.
    if (s.slots.some((x) => x.live && x.app)) router.refresh();
  };

  const run = (c: Command, rest = "") => {
    setQ("");
    setSel(0);
    if (c.mode) {
      setMode(c.mode);
      if (rest) submit(c.mode, rest);
      else {
        if (c.mode === "chat" && chatLog.turns.length) setPanel({ kind: "chat" });
        input.current?.focus();
      }
      return;
    }
    if (c.id === "play") setPlay(true);
    else if (c.id === "random") {
      const pool = apps.filter((a) => a.origin === "curated");
      router.push(`/guides/${pool[Math.floor(Math.random() * pool.length)].slug}`);
    } else if (c.id === "model") window.dispatchEvent(new Event("oauthready:model"));
    else if (c.id === "clear") {
      stop();
      setChatLog({ turns: [], busy: false });
      setPanel(null);
      setPeek(null);
      input.current?.focus();
    }
  };

  const submit = (m: Mode, raw: string) => {
    const text = raw.trim();
    if (!text) return;
    // "/ask how long is gmail's review" works in one go.
    const typed = /^\/(\w+)\s*([\s\S]*)$/.exec(text);
    if (typed) {
      const c = COMMANDS.find((x) => x.id === typed[1].toLowerCase()) ?? (menuOpen ? matches[sel] : undefined);
      if (c) run(c, typed[2]);
      else setPanel({ kind: "note", text: `No command “/${typed[1]}”. Type / to see them.` });
      return;
    }
    if (m === "investigate") {
      const r = intent(text, apps);
      if (r.mode === "investigate") return go(r.text);
      setMode(r.mode);
      return submit(r.mode, r.text);
    }
    if (m === "ask") return void ask(text);
    if (m === "chat") return void chat(text);
    return void compare(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    setFocus(true);
    if (e.nativeEvent.isComposing) return;
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
    if (e.key === "Enter") {
      // Enter sends; shift+enter is a new line, in chat only.
      if (!e.shiftKey || mode !== "chat") {
        e.preventDefault();
        if (!e.shiftKey) submit(mode, q);
      }
    } else if (e.key === "Tab" && !e.shiftKey && !q && mode === "investigate" && tip) {
      e.preventDefault();
      const full = TIPS.find((t) => t.startsWith(tip)) ?? tip;
      setQ(full);
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      switchMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
    } else if (e.key === "Backspace" && !q && mode !== "investigate") {
      switchMode("investigate");
    } else if (e.key === "Escape" && !busy) {
      if (q.startsWith("/")) setQ("");
      else {
        e.currentTarget.blur();
        setFocus(false);
      }
    }
  };

  const chip = "border border-white/40 bg-black/10 px-2 py-0.5 text-white hover:border-accent hover:bg-accent hover:text-[#13221a]";

  return (
    <div
      ref={box}
      className="scroll-mt-20"
      onBlur={(e) => {
        // Tabbing to something outside the box ends the spotlight.
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setFocus(false);
      }}
    >
      <div ref={stage} className={`relative transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${focus ? "z-30" : ""}`}>
        <div className="relative">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(mode, q);
            }}
            className="flex overflow-hidden border-2 border-[#13221a] bg-[#0d1611] shadow-[4px_4px_0_#13221a] transition-[box-shadow,transform] duration-300 focus-within:border-accent focus-within:shadow-[6px_6px_0_#f7b9e4] focus-within:-translate-x-px focus-within:-translate-y-px"
          >
            {mode === "investigate" ? (
              <span className="flex items-start pl-4 pt-3.5 font-mono text-sm leading-5 text-accent">$</span>
            ) : (
              <button
                type="button"
                key={mode}
                onClick={() => switchMode("investigate")}
                title="Back to investigate (backspace)"
                className="chip-pop my-2 ml-2 flex max-h-8 items-center gap-1.5 self-start bg-accent px-2 py-2 font-pixel text-[10px] text-[#13221a] hover:bg-white"
              >
                <PixelIcon name={MODE_ICON[mode]} size={12} accent="var(--hot)" />
                {mode}
              </button>
            )}
            <textarea
              ref={input}
              rows={1}
              wrap={q ? "soft" : "off"}
              value={q}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\/\S*$/.test(v) && !menuOpen) {
                  // Float only if the hero has room below the box (it clips its overflow).
                  const sec = box.current?.closest("section")?.getBoundingClientRect();
                  const f = e.currentTarget.form?.getBoundingClientRect();
                  setFloatMenu(!!panel && panel.kind !== "note" && !!sec && !!f && sec.bottom - f.bottom > 360);
                }
                setQ(v);
                setSel(0);
              }}
              onPointerDown={() => setFocus(true)}
              onKeyDown={onKeyDown}
              placeholder={
                mode === "investigate" && tip
                  ? `try ${tip}`
                  : mode === "ask" && convo
                    ? `follow up${convo.app ? ` on ${convo.app.name}` : ""}, or name another app`
                    : mode === "chat" && chatLog.turns.length
                      ? "reply… (shift+enter for a new line)"
                      : PLACEHOLDER[mode]
              }
              aria-label={`Search box, ${mode} mode. Type / for commands.`}
              role="combobox"
              aria-expanded={menuOpen}
              aria-controls="search-commands"
              className="no-scrollbar min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-3.5 font-mono text-sm leading-5 outline-none placeholder:text-faint placeholder:text-ellipsis"
              maxLength={mode === "chat" ? 4000 : mode === "ask" ? 300 : 120}
              autoFocus
            />
            {busy ? (
              <button type="button" onClick={stop} aria-label="Stop" title="Stop (esc)" className="bg-white px-4 font-pixel text-sm text-[#13221a] hover:bg-accent sm:px-5">
                <span className="hidden sm:inline">stop </span>■
              </button>
            ) : (
              <button aria-label={mode} className="bg-accent px-4 font-pixel text-sm text-[#13221a] hover:bg-white sm:px-5">
                <span className="hidden sm:inline">{menuOpen ? "run" : mode === "chat" ? "send" : mode} </span>→
              </button>
            )}
          </form>

          {/* Slash menu, like a terminal's completion list: in flow normally (the hero clips
            overflow), floating over an open answer so the answer doesn't jump. */}
          {menuOpen && (
            <div
              id="search-commands"
              role="listbox"
              className={`fade-in mt-2 border-2 border-[#13221a] bg-[#0d1611] py-1 shadow-[4px_4px_0_#13221a] ${floatMenu ? "absolute inset-x-0 top-full z-40" : ""}`}
            >
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
        </div>

        {/* What the box will do with what you've typed */}
        {(!menuOpen || floatMenu) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-white/75">
            {routed && routed.mode !== "investigate" ? (
              <span key={routed.mode} className="fade-in flex items-center gap-2">
                <kbd className="border border-white/30 px-1">↵</kbd>
                <span className="flex items-center gap-1.5 bg-accent px-2 py-0.5 font-pixel text-[10px] text-[#13221a]">
                  <PixelIcon name={MODE_ICON[routed.mode]} size={11} accent="var(--hot)" />
                  {routed.mode}
                </span>
                <span>{ROUTE[routed.mode]}</span>
              </span>
            ) : mode === "investigate" ? (
              <>
                <span>try one outside the library:</span>
                {TRY.map((t) => (
                  <button key={t} type="button" onClick={() => go(t)} className={chip}>
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
                  <span>follow-up to your {convo.app ? `${convo.app.name} guide` : "library"} chat · name an app to switch</span>
                ) : (
                  <>
                    <span>answering from the whole library · or about one app:</span>
                    {apps.slice(0, 6).map((a) => (
                      <button
                        key={a.slug}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setQ((v) => (v.trim() ? `${v.trimEnd()} (${a.name})` : `What's the hardest part of ${a.name}?`))}
                        className={chip}
                      >
                        {a.name}
                      </button>
                    ))}
                  </>
                )}
              </>
            ) : mode === "chat" ? (
              <>
                <button
                  type="button"
                  aria-pressed={webSearch}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={toggleSearch}
                  title={webSearch ? "Chat may search the web before answering" : "Chat answers without searching the web"}
                  className={`${webSearch ? "border border-accent bg-accent px-2 py-0.5 text-[#13221a] hover:bg-white" : chip} flex items-center gap-1.5`}
                >
                  <span aria-hidden>{webSearch ? "◉" : "○"}</span> web search {webSearch ? "on" : "off"}
                </button>
                <span>
                  {chatLog.turns.length
                    ? `continuing your chat · ${chatLog.turns.length} message${chatLog.turns.length === 1 ? "" : "s"} · /clear starts over`
                    : "open chat: code, writing, ideas, anything · reads links you paste"}
                </span>
              </>
            ) : named.length || unknown.length ? (
              <>
                <span>comparing</span>
                {[...named.slice(0, 3).map((a) => ({ k: a.slug, label: a.name, known: true })), ...unknown.slice(0, 3).map((w) => ({ k: `?${w}`, label: w, known: false }))].map((x, i) => (
                  <span key={x.k} className="flex items-center gap-2">
                    {i > 0 && <span className="text-accent">vs</span>}
                    <span className={x.known ? "bg-accent px-2 py-0.5 text-[#13221a]" : "border border-dashed border-white/50 px-2 py-0.5 text-white"}>
                      {x.label}
                      {!x.known && "?"}
                    </span>
                  </span>
                ))}
                {unknown.length > 0 && <span className="text-white/60">AI fixes typos · new apps get researched live</span>}
              </>
            ) : (
              <>
                <span>pick apps:</span>
                {apps.slice(0, 8).map((a) => (
                  <button key={a.slug} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ((v) => `${v.trimEnd()} ${a.name}`.trimStart())} className={chip}>
                    {a.name}
                  </button>
                ))}
              </>
            )}
            <span className="ml-auto hidden text-white/55 sm:inline">
              {busy ? (
                <>
                  <kbd className="border border-white/30 px-1">esc</kbd> stop
                </>
              ) : (
                <>
                  {mode === "investigate" && !q && (
                    <>
                      <kbd className="border border-white/30 px-1">tab</kbd> use tip ·{" "}
                    </>
                  )}
                  <kbd className="border border-white/30 px-1">/</kbd> commands · <kbd className="border border-white/30 px-1">⇧tab</kbd> mode
                </>
              )}
            </span>
          </div>
        )}

        {panel && (
          <div key={panel.kind} className="fade-in relative mt-4 border-2 border-[#13221a] bg-[#0d1611] shadow-[4px_4px_0_#13221a]">
            <button
              type="button"
              onClick={() => {
                stop();
                setPanel(null);
                setPeek(null);
              }}
              aria-label="Close"
              className="absolute right-2.5 top-2 z-10 font-pixel text-[10px] text-faint hover:text-text"
            >
              ✕
            </button>
            {panel.kind === "ask" && <AskPanel c={panel.c} peek={peek} setPeek={setPeek} />}
            {panel.kind === "compare" && <ComparePanel s={panel.s} onRetry={() => void compare(panel.s.text)} />}
            {panel.kind === "chat" && chatLog.turns.length > 0 && (
              <ChatPanel chat={chatLog} onRetry={() => void chat(chatLog.turns[chatLog.turns.length - 1].q, true)} onNew={() => run(COMMANDS.find((c) => c.id === "clear")!)} />
            )}
            {panel.kind === "note" && <p className="px-4 py-3 pr-10 font-mono text-[12px] text-muted">{panel.text}</p>}
          </div>
        )}
      </div>

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

function ComparePanel({ s, onRetry }: { s: Cmp; onRetry: () => void }) {
  const ready = s.slots.filter((x) => x.app).map((x) => x.app!);
  const rows: [string, (a: AppSummary) => React.ReactNode][] = [
    ["verdict", (a) => <span className="tag-pixel text-[10px]">{a.label}</span>],
    ["difficulty", (a) => <Difficulty level={a.difficulty} size="sm" />],
    ["first connection", (a) => a.timeToDev],
    ["production", (a) => a.timeToProd],
    ["worst-case wait", (a) => (a.wait ? `up to ${fmtHours(a.wait)}` : "none")],
    ["Composio managed app", (a) => (a.managed === null ? "unknown" : a.managed ? (a.wait > 24 ? "yes, skip the wait" : "yes") : "no")],
  ];
  const easiest = [...ready].sort((x, y) => x.prod[1] - y.prod[1])[0];
  // The "read as" trail only matters when the AI was involved: typos fixed or apps researched.
  const trail = s.stage !== "ready" || s.slots.some((x) => x.live || norm(x.typed) !== norm(x.name));
  return (
    <div className="p-4 pr-8">
      <div className="flex items-center gap-2 font-pixel text-[10px] text-accent">
        <PixelIcon name="versus" size={12} accent="var(--hot)" />
        compare
      </div>

      {s.stage === "reading" && (
        <div className="mt-3">
          <Working verb="Reading your list" t0={s.t0} extra="fixing typos, matching the library" />
        </div>
      )}

      {trail && s.slots.length > 0 && (
        <ul className="mt-3 space-y-1.5 font-mono text-[12px]">
          {s.slots.map((x, i) => (
            <li key={i} className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="text-faint">⎿</span>
                {norm(x.typed) !== norm(x.name) && (
                  <>
                    <span className="text-muted line-through decoration-white/30">{x.typed}</span>
                    <span className="text-faint">→</span>
                  </>
                )}
                <span className="text-text">{x.name}</span>
                {!x.live ? (
                  <span className="text-faint">in the library</span>
                ) : x.live.error ? (
                  <span className="text-danger">✗ {x.live.error}</span>
                ) : x.app ? (
                  <span className="text-tested">
                    ✓ guide ready in {Math.max(1, Math.round(((x.live.t1 ?? x.live.t0) - x.live.t0) / 1000))}s ·{" "}
                    <Link href={`/guides/${x.app.slug}`} className="text-accent hover:text-white">
                      open →
                    </Link>
                  </span>
                ) : (
                  <Working verb={x.live.verb} t0={x.live.t0} extra={x.live.tokens ? `↓ ${(x.live.tokens / 1000).toFixed(1)}k tokens` : "researching live"} />
                )}
              </div>
              {x.live && !x.app && !x.live.error && x.live.detail && <p className="truncate pl-5 text-[11px] text-faint">{x.live.detail}</p>}
            </li>
          ))}
        </ul>
      )}

      {s.slots.length > 0 && (
        <div className="no-scrollbar mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse font-mono text-[11px]">
            <thead>
              <tr>
                <th className="w-32" />
                {s.slots.map((x, i) => (
                  <th key={i} className="pb-2 text-left font-sans text-[15px] font-semibold text-text">
                    {x.app ? (
                      <Link href={`/guides/${x.app.slug}`} className="hover:text-accent">
                        {x.name}
                      </Link>
                    ) : (
                      <span className="text-muted">{x.name}</span>
                    )}
                    {x.app?.origin === "agent" && <span className="ml-1.5 font-pixel text-[8px] text-agent">agent</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, cell], r) => (
                <tr key={label} className="border-t border-line/70 align-top">
                  <td className="py-1.5 pr-3 text-faint">{label}</td>
                  {s.slots.map((x, i) => (
                    <td key={i} className="py-1.5 pr-3 text-text/90">
                      {x.app ? cell(x.app) : x.live?.error ? <span className="text-faint">n/a</span> : r === 0 ? <span className="shimmer">researching…</span> : <span className="text-faint">·</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ready.length >= 2 && (
        <div className="mt-4 border-t border-line pt-3">
          <WaitChart apps={ready} bare />
        </div>
      )}

      {(easiest || s.note || s.model) && s.stage === "ready" && (
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-2 font-mono text-[11px] text-muted">
          {ready.length >= 2 ? (
            <span>
              Fastest to production: <span className="text-accent">{easiest.name}</span>, up to {fmtHours(easiest.prod[1])} end to end.
            </span>
          ) : (
            <span>Not enough guides finished to compare.</span>
          )}
          <span className="flex items-baseline gap-3 text-[10px] text-faint">
            {s.note ?? (s.model ? `names read by ${s.model}` : "")}
            {s.slots.some((x) => x.live?.error) && (
              <button type="button" onClick={onRetry} className="font-mono text-[11px] text-accent hover:text-white">
                try again
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function ChatPanel({ chat, onRetry, onNew }: { chat: Chat; onRetry: () => void; onNew: () => void }) {
  const list = useRef<HTMLDivElement>(null);
  const last = chat.turns[chat.turns.length - 1];
  // A new message jumps to the bottom; a streaming reply is followed unless you scrolled up.
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat.turns.length]);
  useEffect(() => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 140) el.scrollTo({ top: el.scrollHeight });
  }, [last.text, last.thought]);
  return (
    <div className="p-4 pr-8">
      <div className="flex items-center gap-2 font-pixel text-[10px] text-accent">
        <PixelIcon name="chat" size={12} accent="var(--hot)" />
        chat · anything goes
        <button type="button" onClick={onNew} className="ml-auto font-mono text-[10px] text-faint hover:text-text">
          + new chat
        </button>
      </div>
      <div ref={list} className="no-scrollbar mt-1 max-h-[min(62vh,560px)] space-y-5 overflow-y-auto overscroll-contain pt-2">
        {chat.turns.map((t, i) => {
          const streaming = chat.busy && i === chat.turns.length - 1;
          return (
            <div key={i} className="space-y-2">
              <div className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap break-words border border-line bg-white/[0.05] px-3 py-2 text-[14px] text-text">{t.q}</p>
              </div>
              {t.tools?.length ? <ToolLines tools={t.tools} /> : null}
              <Thought t={t} streaming={streaming} />
              {t.text && (
                <div className="break-words text-[14px] leading-relaxed text-text/90">
                  <RichText text={t.text} />
                  {streaming && <span className="caret" />}
                </div>
              )}
              {t.error && <p className="font-mono text-[12px] text-danger">{t.error}</p>}
              {t.stopped && (
                <p className="font-mono text-[11px] text-faint">
                  <span className="text-danger">⏺</span> Interrupted
                </p>
              )}
            </div>
          );
        })}
      </div>
      {!chat.busy && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-2 font-mono text-[10px] text-faint">
          <span>{[last.model, last.tools?.length ? `used ${[...new Set(last.tools.map((x) => x.name.toLowerCase()))].join(", ")}` : "open chat, not from the guides"].filter(Boolean).join(" · ")}</span>
          <span className="ml-auto flex gap-3">
            {last.text && <CopyButton text={last.text} />}
            <button type="button" onClick={onRetry} className="hover:text-text">
              retry
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/** What the chat looked up before answering: ⏺ Search(query) ⎿ 8 results. */
function ToolLines({ tools }: { tools: ChatTool[] }) {
  return (
    <div className="space-y-1 font-mono text-[11px] leading-relaxed">
      {tools.map((x) => (
        <div key={x.id} className="fade-in min-w-0">
          <div className="flex min-w-0 gap-2">
            <span className={x.status === "run" ? "pulse-dot text-muted" : x.status === "ok" ? "text-tested" : "text-you"}>⏺</span>
            <span className="min-w-0 truncate">
              <span className="font-semibold text-text">{x.name}</span>
              <span className="text-muted">({x.arg})</span>
            </span>
          </div>
          {x.result && (
            <div className="flex min-w-0 gap-2 pl-1.5">
              <span className="text-faint">⎿</span>
              <span className={`min-w-0 truncate ${x.status === "warn" ? "text-you" : "text-faint"}`}>{x.result}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Reasoning, Claude-style: live while the model thinks, then folded into "Thought for Ns". */
function Thought({ t, streaming }: { t: ChatTurn; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  if (streaming && !t.text)
    return (
      <div className="min-w-0">
        <Working verb={t.thought ? "Thinking" : t.tools?.some((x) => x.status === "run") ? "Researching" : "Warming up"} t0={t.t0} extra="esc to interrupt" />
        {t.thought && <p className="mt-1 line-clamp-3 border-l border-line pl-3 font-mono text-[11px] italic leading-relaxed text-faint">{t.thought.slice(-360)}</p>}
      </div>
    );
  if (!t.thought.trim()) return null;
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="font-mono text-[11px] text-faint hover:text-text">
        <span className="text-accent">✻</span> {t.thinkMs ? `Thought for ${Math.max(1, Math.round(t.thinkMs / 1000))}s` : "Thought"} {open ? "▾" : "▸"}
      </button>
      {open && <p className="no-scrollbar mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap border-l border-line pl-3 font-mono text-[11px] leading-relaxed text-faint">{t.thought.trim()}</p>}
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
