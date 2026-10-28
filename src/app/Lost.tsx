"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The 404 body: a missing guide offers to investigate that app; anything else points home. */
export function Lost() {
  const path = usePathname() ?? "";
  const slug = /^\/guides\/([a-z0-9-]{1,80})\/?$/.exec(path)?.[1];
  const name = slug?.replace(/-/g, " ");
  const btn = "inline-flex items-center gap-2 border-2 border-[#13221a] px-4 py-2.5 font-pixel text-xs shadow-[4px_4px_0_#13221a] transition-transform hover:-translate-x-px hover:-translate-y-px";
  return (
    <>
      <div data-solid className="font-pixel text-[96px] leading-[0.8] text-accent sm:text-[160px]">
        404
      </div>
      <span data-solid className="tag-pixel mt-6 text-[13px]">
        {slug ? "no guide here yet" : "page not found"}
      </span>
      <h1 data-solid className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        {slug ? (
          <>
            Nobody has investigated <span className="text-accent">{name}</span> yet.
          </>
        ) : (
          "This page wandered off."
        )}
      </h1>
      <p data-solid className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/90">
        {slug
          ? "The agent can do it now: it reads the provider's docs, probes the real OAuth endpoints and writes a guide you can share, in about a minute."
          : "The link may be old or mistyped. The library has every guide, and the search box can investigate any app."}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {slug ? (
          <Link href={`/generate?q=${encodeURIComponent(name!)}`} className={`${btn} bg-accent text-[#13221a] hover:bg-white`}>
            investigate {name} →
          </Link>
        ) : (
          <Link href="/" className={`${btn} bg-accent text-[#13221a] hover:bg-white`}>
            back home →
          </Link>
        )}
        <Link href="/#library" className={`${btn} bg-[#0d1611] text-white hover:text-accent`}>
          browse the library
        </Link>
      </div>
    </>
  );
}
