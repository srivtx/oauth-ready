"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface Grid {
  cols: number;
  rows: number;
  on: boolean[];
  emH: number; // height in em at the same font-size as Silkscreen text
  emW: number;
}

/** Sample Silkscreen glyphs onto their native pixel grid (so variants line up with Silkscreen headings). */
export function useSilkGrid(text: string): Grid | null {
  const [g, setG] = useState<Grid | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await document.fonts.ready;
      } catch {}
      if (!alive) return;
      const family = getComputedStyle(document.body).getPropertyValue("--font-silkscreen").trim() || "monospace";
      const F = 96;
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.font = `${F}px ${family}`;
      const w = Math.ceil(ctx.measureText(text).width) + 4;
      const h = Math.ceil(F * 1.2);
      c.width = w;
      c.height = h;
      ctx.font = `${F}px ${family}`;
      ctx.textBaseline = "top";
      ctx.fillText(text, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      const ink = (x: number, y: number) => data[(y * w + x) * 4 + 3] > 128;
      let p = Infinity;
      for (let y = 0; y < h; y += 2) {
        let run = 0;
        for (let x = 0; x <= w; x++) {
          if (x < w && ink(x, y)) run++;
          else if (run) {
            if (run >= 3) p = Math.min(p, run);
            run = 0;
          }
        }
      }
      if (!isFinite(p)) return;
      let top = h, bottom = 0, left = w, right = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (ink(x, y)) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
      const cols = Math.round((right - left + 1) / p);
      const rows = Math.round((bottom - top + 1) / p);
      const on: boolean[] = [];
      for (let r = 0; r < rows; r++)
        for (let col = 0; col < cols; col++) on.push(ink(Math.min(w - 1, Math.floor(left + (col + 0.5) * p)), Math.min(h - 1, Math.floor(top + (r + 0.5) * p))));
      if (alive) setG({ cols, rows, on, emH: (rows * p) / F, emW: (cols * p) / F });
    })();
    return () => {
      alive = false;
    };
  }, [text]);
  return g;
}

const Placeholder = ({ text }: { text: string }) => <span className="font-pixel opacity-0">{text}</span>;

function Frame({ g, children, label, pad = 0 }: { g: Grid; children: React.ReactNode; label: string; pad?: number }) {
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${g.cols + pad * 2} ${g.rows + pad * 2}`}
      style={{ height: `${g.emH * (1 + (pad * 2) / g.rows)}em`, width: `${g.emW * (1 + (pad * 2) / g.cols)}em`, overflow: "visible" }}
      role="img"
      aria-label={label}
    >
      {children}
    </svg>
  );
}

const cells = (g: Grid) => g.on.map((v, i) => ({ v, x: i % g.cols, y: Math.floor(i / g.cols), i }));

/**
 * Letters built from the characters of a real OAuth authorize request, with a chase on top:
 * a thief ($, a stolen token) hops from tile to tile and a cop (★, siren flashing) chases it.
 * A second cop stays on duty inside the O: thinking, looking around, pacing, dozing, never chasing.
 * Moves follow the letter shapes, and both can leap the gap between letters.
 */
const OAUTH_URL =
  "GET /oauth/authorize?response_type=code&client_id=a9f3k2&redirect_uri=https://app.dev/cb&scope=read:user+repo&state=x7Qp&code_challenge=E9Mel&code_challenge_method=S256 → 302 consent → code=4/0AX… → POST /token → access_token ✓ ";

const TICK = 300;

interface Board {
  pts: { x: number; y: number }[];
  adj: number[][];
}

function board(g: Grid): Board {
  const pts: { x: number; y: number }[] = [];
  const at = new Map<number, number>();
  g.on.forEach((v, i) => {
    if (!v) return;
    at.set(i, pts.length);
    pts.push({ x: i % g.cols, y: Math.floor(i / g.cols) });
  });
  const id = (x: number, y: number) => (x < 0 || y < 0 || x >= g.cols || y >= g.rows ? undefined : at.get(y * g.cols + x));
  const adj = pts.map(({ x, y }) => {
    const out: number[] = [];
    // 8-way: Silkscreen's rounded corners only touch diagonally, so 4-way would split letters into islands.
    for (const dx of [-1, 0, 1])
      for (const dy of [-1, 0, 1]) {
        const n = dx || dy ? id(x + dx, y + dy) : undefined;
        if (n !== undefined) out.push(n);
      }
    // Leap across the gap to the next letter.
    for (const dx of [1, -1])
      if (id(x + dx, y) === undefined)
        for (const k of [2, 3]) {
          const n = id(x + dx * k, y);
          if (n !== undefined) {
            out.push(n);
            break;
          }
        }
    return out;
  });
  return { pts, adj };
}

function bfs(b: Board, from: number[]): number[] {
  const d = b.pts.map(() => Infinity);
  const q = [...from];
  from.forEach((f) => (d[f] = 0));
  while (q.length) {
    const c = q.shift()!;
    for (const n of b.adj[c]) if (d[n] === Infinity) (d[n] = d[c] + 1), q.push(n);
  }
  return d;
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

interface Chase {
  thief: number;
  cop: number;
  caught: number; // ticks left in the "caught" pause, 0 while running
  moves: number;
  run: number; // ticks since the last catch; the thief tires the longer it runs
  idle: { at: number; act: IdleAct; hops: number }; // the off-duty cop in the O
}

type IdleAct = "think" | "look" | "doze" | "hop" | "alert";
const IDLE_GLYPH: Record<IdleAct, string> = { think: "…", look: "?", doze: "z", hop: "★", alert: "!" };

/** The idle cop's beat: mostly stands and thinks, sometimes paces or hops, shouts when the thief passes. */
function idleStep(b: Board, s: Chase, home: Set<number>): Chase["idle"] {
  const me = s.idle;
  const near = Math.abs(b.pts[s.thief].x - b.pts[me.at].x) + Math.abs(b.pts[s.thief].y - b.pts[me.at].y) <= 3;
  if (near && !s.caught) return { ...me, act: "alert" };
  if (me.act === "alert" || Math.random() < 0.08) {
    const r = Math.random();
    if (r < 0.3) {
      const steps = b.adj[me.at].filter((n) => home.has(n) && n !== s.thief && n !== s.cop);
      if (steps.length) return { at: pick(steps), act: "look", hops: me.hops + 1 };
    }
    if (r < 0.45) return { ...me, act: "hop", hops: me.hops + 1 };
    if (r < 0.6) return { ...me, act: "doze" };
    if (r < 0.8) return { ...me, act: "look" };
    return { ...me, act: "think" };
  }
  return me.act === "hop" ? { ...me, act: "think" } : me;
}

function step(b: Board, s: Chase, home: Set<number>): Chase {
  s = { ...s, idle: idleStep(b, s, home) };
  if (s.caught > 1) return { ...s, caught: s.caught - 1 };
  if (s.caught === 1) {
    // Respawn the thief as far from the cop as possible (only on tiles the cop can reach).
    const d = bfs(b, [s.cop]);
    const far = Math.max(...d.filter(isFinite));
    return { ...s, caught: 0, run: 0, thief: pick(d.flatMap((v, i) => (isFinite(v) && v >= far - 1 ? [i] : []))), moves: s.moves + 1 };
  }
  // Thief: runs to the tile farthest from the cop, preferring tiles with room to keep running
  // (so it avoids dead ends). It only tires after a long chase, so every chase still ends.
  let thief = s.thief;
  const tired = s.run < 50 ? 0.03 : Math.min(0.6, 0.03 + (s.run - 50) * 0.008);
  if (Math.random() > tired) {
    const d = bfs(b, [s.cop]);
    const score = (o: number) => d[o] * 3 + b.adj[o].filter((n) => d[n] >= d[o]).length;
    const opts = [s.thief, ...b.adj[s.thief]];
    const best = Math.max(...opts.map(score));
    thief = pick(opts.filter((o) => score(o) === best));
  }
  // Cop: one step along a shortest path to the thief, pausing now and then to look around.
  let cop = s.cop;
  if (Math.random() > 0.15) {
    const dt = bfs(b, [thief]);
    const opts = b.adj[cop].filter((n) => dt[n] < dt[cop]);
    if (opts.length) cop = pick(opts);
  }
  const caught = cop === thief || (cop === s.thief && s.cop === thief) ? 4 : 0;
  return { ...s, thief, cop, caught, moves: s.moves + 1, run: caught ? 0 : s.run + 1 };
}

function Runner({ x, y, far, moves, teleport = false, children }: { x: number; y: number; far: boolean; moves: number; teleport?: boolean; children: React.ReactNode }) {
  return (
    <g style={{ transform: `translate(${x}px, ${y}px)`, transition: teleport ? "none" : `transform ${TICK - 30}ms cubic-bezier(0.3, 0.7, 0.4, 1)` }}>
      <g key={moves} className={teleport ? "fade-in" : far ? "leap-far" : "leap"}>
        {children}
      </g>
    </g>
  );
}

export function UrlText({ text, color, animate = true }: { text: string; color: string; animate?: boolean }) {
  const g = useSilkGrid(text);
  const b = useMemo(() => (g ? board(g) : null), [g]);
  const [s, setS] = useState<Chase | null>(null);
  const prev = useRef<Chase | null>(null);

  useEffect(() => {
    if (!b || !animate || b.pts.length < 10) return;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    if (reduce) return;
    const n = b.pts.length;
    // The first letter is the idle cop's beat; the chase cop starts just outside it.
    const home = new Set(b.pts.flatMap((p, i) => (p.x <= Math.min(...b.pts.map((q) => q.x)) + 3 ? [i] : [])));
    const homeList = [...home];
    const start = b.pts.findIndex((_, i) => !home.has(i));
    setS({ thief: n - 1, cop: start, caught: 0, moves: 0, run: 0, idle: { at: homeList[Math.floor(homeList.length / 2)], act: "think", hops: 0 } });
    const id = setInterval(
      () =>
        setS((cur) => {
          prev.current = cur;
          return cur ? step(b, cur, home) : cur;
        }),
      TICK,
    );
    return () => clearInterval(id);
  }, [b, animate]);

  if (!g || !b) return <Placeholder text={text} />;
  const p = prev.current;
  const far = (a?: number, z?: number) => a !== undefined && z !== undefined && Math.abs(b.pts[a].x - b.pts[z].x) > 1; // a leap, not a step
  const siren = s && s.moves % 2 ? "#ff6fcf" : "#7cb4ff";
  return (
    <Frame g={g} label={text}>
      {b.pts.map(({ x, y }, k) => (
        <g key={k}>
          <rect x={x + 0.04} y={y + 0.04} width={0.92} height={0.92} rx={0.12} fill={color} />
          <text x={x + 0.5} y={y + 0.74} textAnchor="middle" fontSize={0.72} fontWeight={700} fontFamily="var(--font-jetbrains), monospace" fill="#13221a" opacity={0.55}>
            {OAUTH_URL[k % OAUTH_URL.length].replace(" ", "·")}
          </text>
        </g>
      ))}
      {s && (
        <>
          <Runner x={b.pts[s.idle.at].x} y={b.pts[s.idle.at].y} far={false} moves={s.idle.hops}>
            <rect x={0.04} y={0.04} width={0.92} height={0.92} rx={0.12} fill={s.idle.act === "alert" ? "#ff6fcf" : "#13221a"} />
            <text
              x={0.5}
              y={0.76}
              textAnchor="middle"
              fontSize={0.7}
              fontWeight={800}
              fontFamily="var(--font-jetbrains), monospace"
              fill={s.idle.act === "alert" ? "#13221a" : "#f4fff6"}
              className={s.idle.act === "think" || s.idle.act === "doze" ? "pulse-dot" : undefined}
            >
              {IDLE_GLYPH[s.idle.act]}
            </text>
          </Runner>
          <Runner x={b.pts[s.thief].x} y={b.pts[s.thief].y} far={far(p?.thief, s.thief)} moves={s.caught ? -1 : s.moves} teleport={p?.caught === 1}>
            <g className={s.caught ? "busted" : undefined}>
              <rect x={0.04} y={0.04} width={0.92} height={0.92} rx={0.12} fill={s.caught ? "#ffffff" : "#f7b9e4"} />
              <text x={0.5} y={0.74} textAnchor="middle" fontSize={0.72} fontWeight={800} fontFamily="var(--font-jetbrains), monospace" fill="#13221a">
                {s.caught ? "×" : "$"}
              </text>
            </g>
          </Runner>
          <Runner x={b.pts[s.cop].x} y={b.pts[s.cop].y} far={far(p?.cop, s.cop)} moves={s.moves}>
            <rect x={0.04} y={0.04} width={0.92} height={0.92} rx={0.12} fill="#13221a" />
            <text x={0.5} y={0.76} textAnchor="middle" fontSize={0.7} fontWeight={800} fontFamily="var(--font-jetbrains), monospace" fill={siren}>
              {s.caught ? "!" : "★"}
            </text>
          </Runner>
        </>
      )}
    </Frame>
  );
}
