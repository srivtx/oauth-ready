"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Small seeded PRNG so each app's dither halo is unique but stable across renders.
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Rasterise an image (same-origin path or data URI) to an N×N alpha mask. */
function useMask(src: string | null, n: number, pad: number) {
  const [mask, setMask] = useState<boolean[] | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!alive) return;
      const c = document.createElement("canvas");
      c.width = c.height = n;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      const inner = n - pad * 2;
      const ratio = (img.naturalWidth || 24) / (img.naturalHeight || 24);
      const w = ratio >= 1 ? inner : inner * ratio;
      const h = ratio >= 1 ? inner / ratio : inner;
      ctx.drawImage(img, (n - w) / 2, (n - h) / 2, w, h);
      try {
        const data = ctx.getImageData(0, 0, n, n).data;
        const out: boolean[] = [];
        for (let i = 0; i < n * n; i++) {
          const [r, g, b, a] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];
          // Mono SVG marks: alpha. Favicons (opaque squares): treat near-white as background.
          const ink = a > 110 && !(r > 235 && g > 235 && b > 235);
          out.push(ink);
        }
        setMask(out);
      } catch {
        setMask(null);
      }
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src, n, pad]);
  return mask;
}

/**
 * A provider's real logo redrawn as pixel art, surrounded by a dithered halo —
 * the logo stays recognisable, the tile reads like a riso print.
 */
export function PixelLogo({
  src,
  seed,
  n = 34,
  ink = "#ffffff",
  dots = "#f7b9e4",
  halo = true,
  className = "",
  label,
}: {
  src: string | null;
  seed: string;
  n?: number;
  ink?: string;
  dots?: string;
  halo?: boolean;
  className?: string;
  label?: string;
}) {
  const pad = Math.round(n * 0.2);
  const mask = useMask(src, n, pad);

  const dither = useMemo(() => {
    if (!halo) return [];
    const r = rng(seed);
    const out: { x: number; y: number; s: number; o: number }[] = [];
    const c = (n - 1) / 2;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const d = Math.hypot(x - c, y - c) / c; // 0 centre → 1 edge
        // Petal-ish modulation so halos aren't perfect circles.
        const ang = Math.atan2(y - c, x - c);
        const petals = 0.18 * Math.sin(ang * (3 + Math.floor(r() * 3)) + r() * 6);
        const p = Math.max(0, 0.95 - Math.abs(d - (0.62 + petals)) * 2.6);
        if (r() < p * 0.85) out.push({ x, y, s: r() < 0.25 ? 0.9 : 0.5, o: 0.35 + r() * 0.6 });
      }
    return out;
  }, [seed, n, halo]);

  return (
    <svg viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" className={className} role="img" aria-label={label}>
      {dither.map((d, i) => {
        const inLogo = mask?.[d.y * n + d.x];
        if (inLogo) return null;
        return <rect key={i} x={d.x + (1 - d.s) / 2} y={d.y + (1 - d.s) / 2} width={d.s} height={d.s} fill={dots} opacity={d.o} />;
      })}
      {mask
        ? mask.map((on, i) =>
            on ? (
              <rect
                key={`m${i}`}
                className="fade-in"
                style={{ animationDelay: `${((i * 7919) % 400) / 1000}s` }}
                x={i % n}
                y={Math.floor(i / n)}
                width={1.02}
                height={1.02}
                fill={ink}
              />
            ) : null,
          )
        : src && (
            // Before rasterising (and without JS) show the crisp mark.
            <image href={src} x={pad} y={pad} width={n - pad * 2} height={n - pad * 2} opacity={0.9} style={{ filter: "invert(1)" }} />
          )}
    </svg>
  );
}

type Piece = { x: number; y: number; dy: number; rot: number; gen: number; burst: boolean };

const SHARDS = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [sx, sy]));

/**
 * Scattered pink pixel clusters for composition, like the poster corners.
 * With `drift`, one piece at a time steps down a cell or turns a quarter, like a slow game of Tetris.
 * A piece that would land on anything marked `data-solid` shatters into pixels and respawns near the top.
 */
export function PixelScatter({ seed, className = "", color = "var(--accent)", drift = false }: { seed: string; className?: string; color?: string; drift?: boolean }) {
  const shapes = useMemo(() => {
    const r = rng(seed);
    const kinds = [
      [[0, 0], [1, 0], [1, 1]],
      [[0, 0], [0, 1], [1, 1], [1, 2]],
      [[0, 0]],
      [[0, 0], [1, 0], [0, 1]],
    ];
    return Array.from({ length: 7 }, () => ({ x: r() * 92 + 2, y: r() * 88 + 4, k: kinds[Math.floor(r() * kinds.length)], s: 8 + Math.floor(r() * 3) * 4 }));
  }, [seed]);
  const [pieces, setPieces] = useState<Piece[]>(() => shapes.map((sh) => ({ x: sh.x, y: sh.y, dy: 0, rot: 0, gen: 0, burst: false })));
  const box = useRef<HTMLDivElement>(null);
  const els = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!drift) return;
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    } catch {}
    const hits = (i: number, down: number) => {
      const el = els.current[i];
      const area = box.current?.closest("section") ?? box.current?.parentElement;
      if (!el || !area) return false;
      const r = el.getBoundingClientRect();
      const a = { l: r.left, r: r.right, t: r.top + down, b: r.bottom + down };
      return Array.from(area.querySelectorAll("[data-solid]")).some((s) => {
        const o = s.getBoundingClientRect();
        return a.l < o.right && a.r > o.left && a.t < o.bottom && a.b > o.top;
      });
    };
    const id = setInterval(() => {
      const i = Math.floor(Math.random() * shapes.length);
      const below = box.current ? box.current.getBoundingClientRect().bottom : Infinity;
      setPieces((ps) =>
        ps.map((p, j) => {
          // Shards have had their moment: respawn somewhere along the top.
          if (p.burst) return { x: 2 + Math.random() * 92, y: 2 + Math.random() * 14, dy: 0, rot: 0, gen: p.gen + 1, burst: false };
          if (j !== i) return p;
          const s = shapes[j].s;
          if (hits(j, s)) return { ...p, burst: true };
          const el = els.current[j];
          if (el && el.getBoundingClientRect().bottom + s > below) return { ...p, burst: true };
          return Math.random() < 0.25 ? { ...p, rot: p.rot + 90 } : { ...p, dy: p.dy + 1 };
        }),
      );
    }, 800);
    return () => clearInterval(id);
  }, [drift, shapes]);

  return (
    <div ref={box} aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      {shapes.map((sh, i) => {
        const p = pieces[i];
        return (
          <div
            key={`${i}-${p.gen}`}
            ref={(el) => {
              els.current[i] = el;
            }}
            className={`absolute ${p.gen ? "fade-in" : ""}`}
            style={{ left: `${p.x}%`, top: `${p.y}%`, transform: `translateY(${p.dy * sh.s}px) rotate(${p.rot}deg)`, transformOrigin: `${sh.s}px ${sh.s}px` }}
          >
            {sh.k.map(([cx, cy], j) =>
              p.burst ? (
                // Each cell breaks into four pixels that fly apart and fade.
                SHARDS.map(([sx, sy], k) => (
                  <span
                    key={`${j}-${k}`}
                    className="shard absolute block"
                    style={
                      {
                        left: cx * sh.s + (sx > 0 ? sh.s / 2 : 0),
                        top: cy * sh.s + (sy > 0 ? sh.s / 2 : 0),
                        width: sh.s / 2,
                        height: sh.s / 2,
                        background: color,
                        "--dx": `${sx * (6 + ((j * 7 + k * 13) % 10))}px`,
                        "--dy": `${sy * 6 - 10 - ((j * 5 + k * 11) % 8)}px`,
                      } as React.CSSProperties
                    }
                  />
                ))
              ) : (
                <span key={j} className="absolute block" style={{ left: cx * sh.s, top: cy * sh.s, width: sh.s, height: sh.s, background: color }} />
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}
