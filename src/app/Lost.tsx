"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The 404, told as the OAuth error every developer has hit: this path isn't registered. */
export function Lost() {
  const path = (usePathname() ?? "/").slice(0, 60);
  const btn = "inline-flex items-center gap-2 border-2 border-[#13221a] px-4 py-2.5 font-pixel text-xs shadow-[4px_4px_0_#13221a] transition-transform hover:-translate-x-px hover:-translate-y-px";
  return (
    <div className="lg:grid lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12">
      <div className="min-w-0">
        <div data-solid className="font-pixel text-[96px] leading-[0.8] text-accent sm:text-[160px]">
          404
        </div>
        <span data-solid className="tag-pixel mt-6 text-[13px]">
          redirect_uri_mismatch
        </span>
        <h1 data-solid className="mt-5 max-w-xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          This page isn&apos;t on the allow-list.
        </h1>
        <p data-solid className="mt-4 max-w-md text-[15px] leading-relaxed text-white/90">
          No provider review for this one: it simply doesn&apos;t exist. Head back and pick a path that does.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className={`${btn} bg-accent text-[#13221a] hover:bg-white`}>
            back home →
          </Link>
          <Link href="/#library" className={`${btn} bg-[#0d1611] text-white hover:text-accent`}>
            browse the library
          </Link>
        </div>
      </div>

      {/* The response you'd get, terminal style. */}
      <pre
        data-solid
        aria-hidden
        className="mt-10 w-full max-w-md overflow-x-auto border-2 border-[#13221a] bg-[#0d1611] p-4 font-mono text-[12px] leading-relaxed text-white/85 shadow-[4px_4px_0_#13221a] lg:mt-0 lg:w-[380px]"
      >
        <span className="text-accent">GET</span> {path}
        {"\n"}
        <span className="text-faint">HTTP/1.1</span> <span className="text-accent">404 Not Found</span>
        {"\n\n"}
        {"{\n"}
        {"  "}
        <span className="text-tested">&quot;error&quot;</span>: &quot;page_not_found&quot;,
        {"\n  "}
        <span className="text-tested">&quot;error_description&quot;</span>:
        {"\n    "}&quot;redirect_uri does not match
        {"\n     "}any registered page&quot;,
        {"\n  "}
        <span className="text-tested">&quot;hint&quot;</span>: &quot;try /&quot;
        {"\n}"}
        <span className="caret" />
      </pre>
    </div>
  );
}
