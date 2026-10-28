"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { brandOf } from "@/lib/brand";
import type { Guide } from "@/lib/types";

export type Cart = Pick<Guide, "slug" | "name" | "logo" | "brandColor"> & { difficulty: Guide["verdict"]["difficulty"] };

/**
 * A pocket console for the library. The menu is a cartridge select: ◀ ▶ picks an app, A starts
 * that app's run. Its approval gates scale with the guide's difficulty (GitHub's are low, Gmail's
 * CASA gates are tall). Clear them all for APPROVED, then A opens the guide.
 */

const W = 80;
const H = 64;
const GROUND = 50;
const C = { bg: "#a9d9b2", mid: "#6aa77a", ink: "#13221a", pink: "#d9579f" };

// 3×5 pixel font.
const FONT: Record<string, string> = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
  F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
  K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
  P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
  Z: "111001010100111", "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
  "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001001010010", "8": "111101111101111",
  "9": "111101111001111", "!": "010010010000010", ":": "000010000010000", "/": "001001010100100", "-": "000000111000000",
  "<": "001010100010001", "=": "000111000111000", ">": "100010001010100", x: "000101010101000", " ": "000000000000000",
};

const RUN = [
  ["..##..", "..##..", ".####.", "#.##.#", "..##..", ".#..#.", "#....#"],
  ["..##..", "..##..", ".####.", "#.##.#", "..##..", "..##..", "..#.#."],
];
const JUMP = ["..##..", "#.##.#", ".####.", "..##..", "..##..", ".#..#.", ".#..#."];

type Gate = { x: number; h: number; passed: boolean };
type Coin = { x: number; y: number; got: boolean };
type Mode = "menu" | "ready" | "play" | "over" | "won";
type Game = { mode: Mode; cart: number; y: number; vy: number; speed: number; t: number; gates: Gate[]; coins: Coin[]; next: number; spawned: number; cleared: number; tokens: number; idle: number };

const goalOf = (d: number) => 4 + d * 2;

const menu = (cart: number): Game => ({ mode: "menu", cart, y: GROUND, vy: 0, speed: 0, t: 0, gates: [], coins: [], next: 40, spawned: 0, cleared: 0, tokens: 0, idle: 0 });
// A run opens with a READY / GO countdown so the player knows what's coming.
const start = (cart: number, d: number): Game => ({ ...menu(cart), mode: "ready", speed: 0.8 + d * 0.07 });
const LEVEL = ["", "EASY", "OK", "TRICKY", "HARD", "BOSS"];

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  [...s].forEach((ch, i) => {
    const g = FONT[ch] ?? FONT[ch.toUpperCase()] ?? FONT[" "];
    for (let k = 0; k < 15; k++) if (g[k] === "1") ctx.fillRect(x + i * 4 + (k % 3), y + Math.floor(k / 3), 1, 1);
  });
}
const centered = (ctx: CanvasRenderingContext2D, s: string, y: number, color: string) => text(ctx, s, Math.round((W - s.length * 4 + 1) / 2), y, color);

function sprite(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, color: string) {
  ctx.fillStyle = color;
  rows.forEach((r, j) => [...r].forEach((c, i) => c === "#" && ctx.fillRect(x + i, y + j, 1, 1)));
}

const shortName = (n: string) => n.replace(/ \(.*\)$/, "").toUpperCase();

function tick(g: Game, jump: boolean, d: number): Game {
  if (g.mode === "menu") return { ...g, t: g.t + 1, idle: g.idle + 1 };
  if (g.mode === "over" || g.mode === "won") return { ...g, idle: g.idle + 1 }; // the world freezes behind the dialog
  if (g.mode === "ready") return g.t >= 100 ? { ...g, mode: "play", t: 0 } : { ...g, t: g.t + 1 };
  const onGround = g.y >= GROUND;
  let vy = g.vy;
  if (jump && onGround) vy = -3.1;
  vy += 0.19;
  const y = Math.min(GROUND, g.y + vy);
  if (y >= GROUND) vy = 0;

  const goal = goalOf(d);
  let next = g.next - g.speed;
  let spawned = g.spawned;
  const gates = g.gates.map((q) => ({ ...q, x: q.x - g.speed })).filter((q) => q.x > -8);
  const coins = g.coins.map((c) => ({ ...c, x: c.x - g.speed })).filter((c) => c.x > -6 && !c.got);
  if (next <= 0 && spawned < goal) {
    // Harder apps: taller gates, closer together.
    const h = Math.min(14, 4 + d + Math.floor(Math.random() * (2 + d)));
    gates.push({ x: W + 2, h, passed: false });
    spawned++;
    if (Math.random() < 0.55) coins.push({ x: W + 20 + Math.random() * 12, y: 28 + Math.floor(Math.random() * 10), got: false });
    next = Math.max(30, 70 - d * 6) + Math.random() * 30;
  }

  let tokens = g.tokens;
  const px = 12;
  const py = y - 7;
  for (const c of coins)
    if (px < c.x + 4 && px + 6 > c.x && py < c.y + 4 && py + 7 > c.y) {
      c.got = true;
      tokens++;
    }
  let cleared = g.cleared;
  let hit = false;
  for (const q of gates) {
    if (px + 1 < q.x + 5 && px + 5 > q.x && y > GROUND + 1 - q.h) hit = true;
    if (!q.passed && q.x + 5 < px) (q.passed = true), cleared++;
  }
  if (hit) return { ...g, mode: "over", y, vy: 0, gates, coins, tokens, cleared, idle: 0 };
  if (cleared >= goal && !gates.length) return { ...g, mode: "won", y, vy: 0, gates, coins, tokens, cleared, idle: 0 };
  return { ...g, y, vy, gates, coins, next, spawned, cleared, tokens, t: g.t + 1, idle: jump ? 0 : g.idle + 1 };
}

function drawMenu(ctx: CanvasRenderingContext2D, g: Game, cart: Cart, logo: boolean[] | null, n: number, total: number) {
  text(ctx, "CHOOSE APP", 2, 2, C.ink);
  text(ctx, `${n + 1}/${total}`, W - 13, 2, C.mid);
  // Logo, redrawn on the LCD, flanked by arrows that nudge outward on the beat.
  const S = 20;
  const ox = (W - S) / 2;
  const oy = 10;
  if (logo) {
    ctx.fillStyle = C.ink;
    logo.forEach((on, i) => on && ctx.fillRect(ox + (i % S), oy + Math.floor(i / S), 1, 1));
  } else centered(ctx, shortName(cart.name).slice(0, 1), oy + 8, C.ink);
  const b = Math.floor(g.t / 20) % 2;
  text(ctx, "<", 7 - b, oy + 8, C.ink);
  text(ctx, ">", W - 10 + b, oy + 8, C.ink);
  centered(ctx, shortName(cart.name), 35, C.ink);
  // Difficulty: five blocks and a word, centred as one row.
  const word = LEVEL[cart.difficulty];
  const rowW = 5 * 4 + 3 + word.length * 4 - 1;
  const rx = Math.round((W - rowW) / 2);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < cart.difficulty ? C.pink : C.mid;
    ctx.fillRect(rx + i * 4, 44, 3, 3);
  }
  text(ctx, word, rx + 23, 43, C.mid);
  // Blinking call to action in a pill.
  if (Math.floor(g.t / 30) % 2 === 0) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(20, 55, 40, 8);
    text(ctx, "A: PLAY", 26, 56, C.bg);
  } else text(ctx, "A: PLAY", 26, 56, C.ink);
}

function drawRun(ctx: CanvasRenderingContext2D, g: Game, cart: Cart) {
  // Distant clouds.
  ctx.fillStyle = C.mid;
  for (let i = 0; i < 4; i++) {
    const raw = i * 31 - g.t * 0.2;
    const x = (((raw % 110) + 110) % 110) - 15;
    ctx.fillRect(x, 17 + (i % 2) * 5, 9, 2);
    ctx.fillRect(x + 2, 16 + (i % 2) * 5, 4, 1);
  }
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, GROUND + 1, W, 1);
  ctx.fillStyle = C.mid;
  for (let x = -((g.t * g.speed) % 6); x < W; x += 6) ctx.fillRect(Math.round(x), GROUND + 3, 2, 1);
  for (const q of g.gates) {
    const x = Math.round(q.x);
    ctx.fillStyle = C.pink;
    ctx.fillRect(x, GROUND + 1 - q.h, 1, q.h);
    ctx.fillRect(x + 4, GROUND + 1 - q.h, 1, q.h);
    for (let yy = GROUND + 1 - q.h; yy < GROUND; yy += 3) ctx.fillRect(x + 1, yy, 3, 1);
  }
  for (const c of g.coins) {
    const x = Math.round(c.x);
    const bob = Math.round(Math.sin((g.t + c.x) / 6));
    ctx.fillStyle = C.ink;
    ctx.fillRect(x + 1, c.y + bob, 2, 4);
    ctx.fillRect(x, c.y + 1 + bob, 4, 2);
  }
  sprite(ctx, g.y < GROUND ? JUMP : RUN[Math.floor(g.t / 6) % 2], 12, Math.round(g.y) - 6, C.ink);
  if (g.mode === "ready") {
    centered(ctx, g.t < 60 ? "READY?" : "GO!", 22, g.t < 60 ? C.ink : C.pink);
    centered(ctx, "A = JUMP", 31, C.mid);
  } else if (g.mode === "play") {
    // Teach the jump: cue it before the first two gates, and remind for the first seconds.
    const near = g.gates.find((q) => !q.passed && q.x > 14 && q.x < 34);
    if (near && g.cleared < 2 && g.y >= GROUND) centered(ctx, "JUMP!", 24, C.pink);
    else if (g.t < 150 && Math.floor(g.t / 25) % 2 === 0) centered(ctx, "A = JUMP", 24, C.ink);
  }
  // HUD: app name, tokens, and progress from dev to prod.
  text(ctx, shortName(cart.name).slice(0, 10), 2, 2, C.ink);
  text(ctx, `x${g.tokens}`, W - 10, 2, C.ink);
  const goal = goalOf(cart.difficulty);
  ctx.fillStyle = C.mid;
  ctx.fillRect(14, 58, W - 44, 2);
  ctx.fillStyle = C.ink;
  ctx.fillRect(14, 58, Math.round(((W - 44) * g.cleared) / goal), 2);
  text(ctx, "DEV", 1, 57, C.ink);
  text(ctx, `${g.cleared}/${goal}`, W - 9 - String(g.cleared).length * 4, 57, C.ink);
  ctx.fillStyle = C.pink;
  ctx.fillRect(W - 29, 55, 1, 6);
  ctx.fillRect(W - 28, 55, 3, 2);
}

function dialog(ctx: CanvasRenderingContext2D, title: string, color: string, lines: string[]) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(8, 17, 64, 12 + lines.length * 7);
  ctx.strokeStyle = C.ink;
  ctx.strokeRect(8.5, 17.5, 63, 11 + lines.length * 7);
  centered(ctx, title, 21, color);
  lines.forEach((l, i) => centered(ctx, l, 29 + i * 7, C.ink));
}

export function Handheld({ carts }: { carts: Cart[] }) {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game>(menu(0));
  const logos = useRef<Record<string, boolean[] | null>>({});
  const input = useRef({ jump: false });
  const touched = useRef(false);
  const [press, setPress] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("menu");

  const flash = (k: string) => {
    setPress(k);
    setTimeout(() => setPress(null), 120);
  };
  const cartOf = (g: Game) => carts[g.cart];

  const act = (k: "l" | "r" | "u" | "d" | "a" | "b" | "start" | "select") => {
    touched.current = true;
    flash(k);
    const g = game.current;
    if (g.mode === "menu") {
      if (k === "l" || k === "u") game.current = { ...menu((g.cart - 1 + carts.length) % carts.length) };
      else if (k === "r" || k === "d" || k === "select") game.current = { ...menu((g.cart + 1) % carts.length) };
      else if (k === "a" || k === "start") game.current = start(g.cart, cartOf(g).difficulty);
    } else if (g.mode === "play" || g.mode === "ready") {
      if (k === "a" || k === "u") input.current.jump = true;
      else if (k === "b" || k === "select") game.current = menu(g.cart);
    } else if (g.mode === "over") {
      if (k === "a" || k === "start") game.current = start(g.cart, cartOf(g).difficulty);
      else game.current = menu(g.cart);
    } else if (g.mode === "won") {
      if (k === "a" || k === "start") router.push(`/guides/${cartOf(g).slug}`);
      else game.current = menu(g.cart);
    }
  };

  // Rasterise each app's logo to a 20×20 mask once.
  useEffect(() => {
    for (const c of carts) {
      const src = brandOf(c).logo;
      if (!src || c.slug in logos.current) continue;
      logos.current[c.slug] = null;
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = cv.height = 20;
        const x = cv.getContext("2d", { willReadFrequently: true });
        if (!x) return;
        x.drawImage(img, 1, 1, 18, 18);
        const d = x.getImageData(0, 0, 20, 20).data;
        logos.current[c.slug] = Array.from({ length: 400 }, (_, i) => d[i * 4 + 3] > 110 && !(d[i * 4] > 235 && d[i * 4 + 1] > 235 && d[i * 4 + 2] > 235));
      };
      img.src = src;
    }
  }, [carts]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}

    const render = () => {
      const g = game.current;
      const cart = cartOf(g);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);
      if (g.mode === "menu") drawMenu(ctx, g, cart, logos.current[cart.slug] ?? null, g.cart, carts.length);
      else drawRun(ctx, g, cart);
      if (g.mode === "over") dialog(ctx, "GATED!", C.pink, [`${g.cleared}/${goalOf(cart.difficulty)} CLEARED`, "A:RETRY  B:BACK"]);
      if (g.mode === "won") dialog(ctx, "APPROVED!", C.pink, [`TOKENS x${g.tokens}`, "A:GUIDE  B:BACK"]);
    };
    render();
    if (reduce) return;

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(ctx.canvas);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) {
        last = now;
        return;
      }
      acc += Math.min(100, now - last);
      last = now;
      while (acc >= 1000 / 60) {
        acc -= 1000 / 60;
        const g = game.current;
        game.current = tick(g, input.current.jump, cartOf(g).difficulty);
        input.current.jump = false;
        const n = game.current;
        // Attract mode: flip through the cartridges until someone touches the console.
        if (n.mode === "menu" && !touched.current && n.t > 0 && n.t % 200 === 0) game.current = menu((n.cart + 1) % carts.length);
        // Left alone for a while: back to the menu.
        if (n.mode !== "menu" && n.idle > 60 * 10) game.current = menu(n.cart);
      }
      render();
      setMode((m) => (m === game.current.mode ? m : game.current.mode));
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carts]);

  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, Parameters<typeof act>[0]> = {
      ArrowLeft: "l", ArrowRight: "r", ArrowUp: "u", ArrowDown: "d", " ": "a", Enter: "a", a: "a", A: "a", b: "b", B: "b", Escape: "b",
    };
    const k = map[e.key];
    if (!k) return;
    e.preventDefault();
    act(k);
  };

  const pad = (k: string) => (press === k ? "translate-y-px bg-black" : "bg-[#13221a] hover:bg-black");

  return (
    <div
      data-solid
      data-dim
      tabIndex={0}
      onKeyDown={onKey}
      aria-label="Pocket console: pick an app with the arrow keys, press A to run its approval gates."
      className="grain relative w-[228px] select-none rounded-[15px_15px_48px_15px] border-2 border-[#13221a] bg-accent px-[17px] pb-6 pt-3.5 text-[#13221a] shadow-[6px_6px_0_#13221a] outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <div className="flex items-center justify-between font-pixel text-[8px]">
        <span className="flex items-center gap-1.5">
          <span className="pulse-dot h-1.5 w-1.5 bg-[#1f6e41]" />
          power
        </span>
        <span>gate runner</span>
      </div>

      {/* Screen */}
      <div className="mt-2.5 rounded-[5px_5px_18px_5px] bg-[#13221a] p-2.5 pb-3">
        <div className="relative overflow-hidden">
          <canvas ref={canvas} width={W} height={H} className="pixelated block aspect-[5/4] w-full" onPointerDown={() => act("a")} />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.07)_0_1px,transparent_1px_3px)]" />
        </div>
        <div className="mt-1.5 flex justify-between font-pixel text-[7px] text-[#93a197]">
          {mode === "menu" ? (
            <>
              <span>◀▶ choose</span>
              <span>A play</span>
            </>
          ) : mode === "play" || mode === "ready" ? (
            <>
              <span>A / space: jump</span>
              <span>B back</span>
            </>
          ) : (
            <>
              <span>A {mode === "won" ? "guide" : "retry"}</span>
              <span>B back</span>
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center justify-between px-0.5">
        <div className="relative h-[66px] w-[66px]" aria-hidden>
          <button tabIndex={-1} onClick={() => act("u")} className={`absolute left-[22px] top-0 h-[22px] w-[22px] rounded-t-[3px] ${pad("u")}`} />
          <button tabIndex={-1} onClick={() => act("d")} className={`absolute bottom-0 left-[22px] h-[22px] w-[22px] rounded-b-[3px] ${pad("d")}`} />
          <button tabIndex={-1} onClick={() => act("l")} className={`absolute left-0 top-[22px] h-[22px] w-[22px] rounded-l-[3px] ${pad("l")}`} />
          <button tabIndex={-1} onClick={() => act("r")} className={`absolute right-0 top-[22px] h-[22px] w-[22px] rounded-r-[3px] ${pad("r")}`} />
          <span className="absolute left-[22px] top-[22px] h-[22px] w-[22px] bg-[#13221a]" />
          <span className="absolute -bottom-3.5 left-0 w-full text-center font-pixel text-[6px]">{mode === "menu" ? "choose" : "move"}</span>
        </div>
        <div className="flex -rotate-[20deg] items-end gap-2.5" aria-hidden>
          <RoundButton label="B" hint="back" active={press === "b"} onClick={() => act("b")} />
          <RoundButton label="A" hint={mode === "menu" ? "play" : mode === "play" || mode === "ready" ? "jump" : mode === "won" ? "guide" : "retry"} active={press === "a"} onClick={() => act("a")} className="-translate-y-3.5" />
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div className="flex gap-2.5 pl-4" aria-hidden>
          {(["select", "start"] as const).map((k) => (
            <button key={k} tabIndex={-1} onClick={() => act(k)} className="flex flex-col items-center gap-1 font-pixel text-[6px]">
              <span className={`h-1.5 w-6 -rotate-[20deg] rounded-full ${press === k ? "bg-black" : "bg-[#13221a] hover:bg-black"}`} />
              {k}
            </button>
          ))}
        </div>
        <div aria-hidden className="grid -rotate-[20deg] grid-cols-4 gap-1 pr-1">
          {Array.from({ length: 12 }, (_, k) => (
            <span key={k} className="h-1 w-1 rounded-full bg-[#13221a]/70" />
          ))}
        </div>
      </div>
    </div>
  );
}

function RoundButton({ label, hint, active, onClick, className = "" }: { label: string; hint: string; active: boolean; onClick: () => void; className?: string }) {
  return (
    <span className={`flex flex-col items-center gap-1 ${className}`}>
      <button
        tabIndex={-1}
        onClick={onClick}
        className={`h-10 w-10 rounded-full border-b-[3px] border-black/40 bg-[#13221a] font-pixel text-[10px] text-accent hover:bg-black ${active ? "translate-y-0.5 border-b" : ""}`}
      >
        {label}
      </button>
      <span className="font-pixel text-[6px]">{hint}</span>
    </span>
  );
}
