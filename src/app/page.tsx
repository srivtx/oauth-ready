import Link from "next/link";
import { Difficulty } from "@/components/bits";
import { Handheld } from "@/components/Handheld";
import { LogoTile, Mark } from "@/components/LogoTile";
import { ModelSettings } from "@/components/ModelSettings";
import { PixelScatter } from "@/components/pixel";
import { UrlText } from "@/components/SilkGrid";
import { SearchBox } from "@/components/SearchBox";
import { WaitChart } from "@/components/WaitChart";
import { CURATED } from "@/lib/guides";
import { listGenerated } from "@/lib/store";
import { summarize } from "@/lib/summary";
import type { Guide } from "@/lib/types";

// Served ready-made and refreshed in the background every minute (and right away when the agent
// saves a guide), so a visit never waits on Blob storage.
export const revalidate = 60;

export default async function Home() {
  const generated = (await listGenerated()).filter((g) => !CURATED.some((c) => c.slug === g.slug));
  const apps = [...CURATED, ...generated].map(summarize);
  const carts = CURATED.map((g) => ({ slug: g.slug, name: g.name, logo: g.logo, brandColor: g.brandColor, difficulty: g.verdict.difficulty }));
  return (
    <main>
      {/* Hero: grain-green poster */}
      <section className="field grain relative overflow-hidden">
        <div data-dim className="absolute inset-0">
          <PixelScatter seed="hero" className="opacity-80" drift />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6 sm:pb-16">
          <div data-dim className="flex flex-wrap justify-between gap-2 font-mono text-[11px] text-white/80 sm:text-xs">
            <span>OAuth app readiness briefings · {CURATED.length} verified · live agent for any app</span>
            <span>sources checked 2026-10-28</span>
          </div>

          <div className="lg:grid lg:grid-cols-[1fr_auto] lg:items-start lg:gap-12">
            <div className="min-w-0">
              <h1 className="sr-only">OAuth Ready: will this integration take an hour, or eight weeks of review?</h1>
              {/* Staggered wordmark: READY steps down and in from OAUTH */}
              <div aria-hidden data-dim className="mt-10 flex flex-col items-start gap-3 sm:mt-14 sm:gap-4">
                <span data-solid className="text-[64px] leading-[0.8] sm:text-[104px]">
                  <UrlText text="OAUTH" color="#f4fff6" />
                </span>
                <span data-solid className="ml-[0.55em] font-pixel text-[64px] leading-[0.8] text-accent sm:ml-[1.35em] sm:text-[104px]">
                  ready
                </span>
              </div>

              <div data-dim data-solid className="mt-6 flex w-fit flex-col items-start gap-1">
                <span className="tag-pixel text-[13px] sm:text-[15px]">An hour of setup —</span>
                <span className="tag-pixel ml-6 text-[13px] sm:ml-10 sm:text-[15px]">or eight weeks of review?</span>
              </div>

              <p data-dim data-solid className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/90 sm:text-base">
                Before your agent can act for users in another app, you need a provider OAuth app, and sometimes the provider has to approve it. Look up an app to see the
                gate, the wait, what an agent can do for you, and where you take over.
              </p>

              <div className="mt-7 max-w-2xl">
                <div data-solid>
                  <SearchBox apps={apps} carts={carts} />
                </div>
                <div data-dim className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-white/75">
                  <span>agent model</span>
                  <ModelSettings />
                  <span>· ~2–5¢ and ~1 min per new guide</span>
                </div>
              </div>
            </div>

            <div className="hidden lg:block lg:pr-6 lg:pt-12">
              <Handheld carts={carts} />
            </div>
          </div>
        </div>
      </section>

      {/* Evidence legend strip */}
      <section data-dim className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-8 gap-y-2 px-4 py-4 font-mono text-[11px] text-muted sm:px-6">
          <span>
            <span className="text-tested">■ tested</span>: we hit the real endpoint
          </span>
          <span>
            <span className="text-sourced">■ sourced</span>: quoted verbatim from a page we read
          </span>
          <span>
            <span className="text-inferred">□ inferred</span>: judgement, verify before relying
          </span>
        </div>
      </section>

      <section data-dim id="library" className="mx-auto max-w-6xl scroll-mt-16 px-4 pb-10 pt-12 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="font-pixel text-xs text-accent">library / curated</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Five apps, five kinds of gate</h2>
          </div>
          <span className="font-mono text-xs text-faint">hand-checked against primary docs + live probes · easy → hard</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CURATED.map((g, i) => (
            <Card key={g.slug} g={g} index={i} />
          ))}
          <Link href="/how" className="group grain relative flex min-h-[220px] flex-col justify-between overflow-hidden border border-dashed border-line p-5 hover:border-accent">
            <PixelScatter seed="more" className="opacity-25" />
            <span className="font-pixel text-xs text-accent">+ 95 more</span>
            <span className="relative text-sm leading-relaxed text-muted group-hover:text-text">
              The path to 100: run the same agent over Composio&apos;s OAuth toolkit list, then a human reviews each inferred claim before the guide gets a{" "}
              <span className="text-tested">verified</span> stamp →
            </span>
          </Link>
        </div>
      </section>

      {generated.length > 0 && (
        <section data-dim className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="font-pixel text-xs text-agent">library / agent-generated</div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Investigated live</h2>
            </div>
            <span className="font-mono text-xs text-faint">not hand-verified · each quote was checked against its source</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {generated.map((g, i) => (
              <Card key={g.slug} g={g} index={i} />
            ))}
          </div>
        </section>
      )}

      <section data-dim className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="font-pixel text-xs text-accent">library / the wait</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">An hour, or eight weeks?</h2>
          </div>
          <span className="font-mono text-xs text-faint">elapsed time to production · log scale · from each guide&apos;s timeline</span>
        </div>
        <WaitChart apps={apps} />
      </section>

      <section data-dim className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-3">
          <Explainer n="01" t="Provider OAuth app" d="Your registration with Google, Slack, and so on: client ID and secret, redirect URLs, scopes. You create it once, and sometimes the provider must approve it." />
          <Explainer n="02" t="Your integration" d="Your agent's code that uses that app to call the provider's API on a user's behalf." />
          <Explainer n="03" t="User connections" d="Each user clicks Connect and approves a consent screen that shows your app's name and scopes." />
        </div>
      </section>
    </main>
  );
}

function Card({ g, index }: { g: Guide; index: number }) {
  return (
    <Link href={`/guides/${g.slug}`} className="group flex flex-col overflow-hidden border border-line bg-panel transition hover:-translate-y-0.5 hover:border-accent">
      <div className="relative">
        <LogoTile g={g} className="aspect-[16/9] w-full" />
        <span className="absolute left-3 top-3 font-pixel text-[10px] text-white/80">{String(index + 1).padStart(2, "0")}</span>
        <span
          className={`absolute right-3 top-3 border px-1.5 py-0.5 font-pixel text-[9px] ${g.origin === "curated" ? "border-white/60 bg-black/25 text-white" : "border-agent/70 bg-black/35 text-agent"}`}
        >
          {g.origin === "curated" ? "verified" : "agent"}
        </span>
        <span className="tag-pixel absolute -bottom-2.5 left-4">{g.verdict.label}</span>
      </div>
      <div className="flex flex-1 flex-col p-5 pt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Mark g={g} size={16} />
            <span className="truncate text-lg font-semibold">{g.name}</span>
          </div>
          <Difficulty level={g.verdict.difficulty} size="sm" />
        </div>
        <div className="font-mono text-[11px] text-faint">{g.category}</div>
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">{g.verdict.headline.replace(/\*\*|`/g, "")}</p>
        <div className="mt-auto grid grid-cols-2 gap-3 border-t border-line pt-3 font-mono text-[11px]">
          <div>
            <div className="text-faint">first connection</div>
            <div className="mt-0.5 line-clamp-2 text-text">{g.timeToDev}</div>
          </div>
          <div>
            <div className="text-faint">production</div>
            <div className="mt-0.5 line-clamp-2 text-text">{g.timeToProd}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Explainer({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <div className="bg-panel p-5">
      <div className="font-pixel text-xs text-accent">{n}</div>
      <div className="mt-2 font-medium">{t}</div>
      <div className="mt-1 text-sm leading-relaxed text-muted">{d}</div>
    </div>
  );
}
