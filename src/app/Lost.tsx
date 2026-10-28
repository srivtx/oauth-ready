"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { fuzzyApp } from "@/lib/match";

/**
 * The 404. A mistyped guide link offers the guide it probably meant; a guide nobody has made
 * yet offers to investigate the app; anything else goes home.
 */
export function Lost({ apps }: { apps: { slug: string; name: string }[] }) {
  const path = usePathname() ?? "";
  const slug = /^\/guides\/([^/]{1,80})\/?$/.exec(path)?.[1]?.toLowerCase();
  const word = slug ? decodeURIComponent(slug).replace(/[-_]+/g, " ").trim() : "";
  const near = word ? fuzzyApp(word, apps) : undefined;

  const [tag, title, line, first] = near
    ? ["guide not found", <>Did you mean <span className="text-accent">{near.name}</span>?</>, `There's no guide at /guides/${slug}, but there's one for ${near.name}.`, { label: `open ${near.name} →`, href: `/guides/${near.slug}` }]
    : word
      ? [
          "no guide here yet",
          <>Nobody has investigated <span className="text-accent">{word}</span> yet.</>,
          "The agent can do it now: it reads the provider's docs, probes the real OAuth endpoints and writes a guide you can share, in about a minute.",
          { label: `investigate ${word} →`, href: `/generate?q=${encodeURIComponent(word)}` },
        ]
      : ["page not found", "This page wandered off.", "The link may be old or mistyped. The library has every guide, and the search box can investigate any app.", { label: "back home →", href: "/" }];
  const btn = "inline-flex items-center gap-2 border-2 border-[#13221a] px-4 py-2.5 font-pixel text-xs shadow-[4px_4px_0_#13221a] transition-transform hover:-translate-x-px hover:-translate-y-px";

  return (
    <>
      <div data-solid className="font-pixel text-[96px] leading-[0.8] text-accent sm:text-[160px]">
        404
      </div>
      <span data-solid className="tag-pixel mt-6 text-[13px]">
        {tag}
      </span>
      <h1 data-solid className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        {title}
      </h1>
      <p data-solid className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/90">
        {line}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={first.href} className={`${btn} bg-accent text-[#13221a] hover:bg-white`}>
          {first.label}
        </Link>
        <Link href="/#library" className={`${btn} bg-[#0d1611] text-white hover:text-accent`}>
          browse the library
        </Link>
      </div>
    </>
  );
}
