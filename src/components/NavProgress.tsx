"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/** Start the bar for a navigation that isn't a link click (router.push from code). */
export const navStart = () => window.dispatchEvent(new Event("oauthready:nav"));

/**
 * A thin pink bar across the top while the next page loads, so a click never looks ignored.
 * Starts on an internal link click (or navStart), creeps toward the end while the server
 * renders, and finishes when the URL changes.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [p, setP] = useState<number | null>(null); // null: hidden
  const creep = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const giveUp = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const start = useCallback(() => {
    clearInterval(creep.current);
    clearTimeout(giveUp.current);
    setP(12);
    creep.current = setInterval(() => setP((v) => (v === null || v >= 100 ? v : v + (90 - v) * 0.1)), 200);
    // Never hang: a navigation that goes nowhere (same page, cancelled) just fades out.
    giveUp.current = setTimeout(() => {
      clearInterval(creep.current);
      setP(null);
    }, 12_000);
  }, []);

  // Finish when the new page is on screen.
  const url = `${pathname}?${search.toString()}`;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    clearInterval(creep.current);
    clearTimeout(giveUp.current);
    setP((v) => (v === null ? null : 100));
    const t = setTimeout(() => setP(null), 450);
    return () => clearTimeout(t);
  }, [url]);

  useEffect(() => {
    // Capture phase: next/link calls preventDefault on its own click to navigate in place.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let to: URL;
      try {
        to = new URL(a.href, location.href);
      } catch {
        return;
      }
      if (to.origin !== location.origin || (to.pathname === location.pathname && to.search === location.search)) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("oauthready:nav", start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("oauthready:nav", start);
      clearInterval(creep.current);
      clearTimeout(giveUp.current);
    };
  }, [start]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px]">
      <div
        className="h-full bg-accent shadow-[0_0_8px_var(--accent)]"
        style={{
          width: `${p ?? 0}%`,
          opacity: p === null || p >= 100 ? 0 : 1,
          // Hidden: snap back to 0 unseen. Finishing: fill, then fade. Otherwise: glide.
          transition: p === null ? "none" : p >= 100 ? "width 200ms ease-out, opacity 250ms ease 200ms" : "width 200ms ease-out",
        }}
      />
    </div>
  );
}
