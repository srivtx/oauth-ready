import { PixelScatter } from "@/components/pixel";
import { PixelIcon, type IconName } from "@/components/PixelIcon";

export const metadata = { title: "How it works · OAuth Ready" };

const PIPE: readonly [string, IconName, string, "agent" | "tested"][] = [
  ["Plan", "plan", "The LLM (reasoning off, for speed) identifies the app and proposes 5–8 official doc URLs: developer portal, OAuth guide, review/partner program, scopes, rate limits.", "agent"],
  ["Read", "read", "Each URL is actually fetched, plus the docs host's llms.txt index when published. Dead links, 404s, login pages, JS-only shells and duplicates are dropped and shown in the transcript.", "agent"],
  ["Follow", "follow", "Links from llms.txt and the pages read are ranked by OAuth/review vocabulary, and the model picks up to 5–7 more to read.", "agent"],
  ["Probe", "probe", "Real GETs to /.well-known/openid-configuration and the authorize endpoint with a fake client_id. This shows the endpoints exist and how they fail.", "tested"],
  ["Write", "write", "DeepSeek V4.1 Flash (reasoning on, streamed live) writes the guide from numbered sources only, constrained by a JSON schema. Every claim is tagged tested / sourced / inferred with source ids.", "agent"],
  ["Check", "check", "Code, not the model, enforces the evidence rules. Citations to unread pages are stripped. For every sourced claim the model must quote the supporting sentence verbatim, and code confirms that sentence exists in the page. If it doesn't, the claim is downgraded to inferred. Links are re-checked.", "tested"],
];

const LEVELS: [string, IconName, string, string][] = [
  ["tested", "probe", "text-tested", "Observed directly: an HTTP probe, or a manual attempt."],
  ["sourced", "doc", "text-sourced", "Stated in a cited page that was actually fetched, with the sentence quoted and checked."],
  ["inferred", "ask", "text-inferred", "Judgement, estimates, or third-party claims. A lead, not a fact."],
];

const AGENT = ["Research the provider's docs", "Choose minimal scopes", "Draft scope justifications and partner emails", "Pre-fill app registrations (GitHub URL params, Slack manifests)"];
const YOU = ["Sign in to the provider console", "Your legal identity and payment", "Record the demo video reviewers ask for", "Wait on the provider's decision"];

export default function HowPage() {
  return (
    <main>
      {/* Header band: pink, so each page has its own colour (home and evidence are green). */}
      <section className="grain relative overflow-hidden bg-accent text-[#13221a]">
        <PixelScatter seed="how" color="var(--field)" className="opacity-70" />
        <div className="relative mx-auto max-w-5xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14">
          <span className="inline-block bg-[#13221a] px-2 py-1 font-pixel text-[11px] text-accent">method</span>
          <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">How a guide gets made, and why you can check it.</h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#13221a]/80">
            Registering an OAuth app is rarely the hard part. The surprises are the <strong>gates</strong>: Google&apos;s CASA assessment for reading Gmail, Slack&apos;s
            10-install prerequisite and up to 10-week review, LinkedIn&apos;s business vetting where a rejection burns the app. So every guide leads with the verdict and a
            timeline that separates your work from waiting, then shows the paths that avoid or shorten the wait.
          </p>
          {/* The six stations, at a glance */}
          <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-3">
            {PIPE.map(([t, icon], i) => (
              <span key={t} className="flex items-center gap-2">
                <a href={`#step-${t.toLowerCase()}`} className="group flex items-center gap-2 border-2 border-[#13221a] bg-[#f4fff6] px-2 py-1 shadow-[3px_3px_0_#13221a] hover:-translate-y-px">
                  <PixelIcon name={icon} size={16} accent="var(--hot)" />
                  <span className="font-pixel text-[11px]">{t}</span>
                </a>
                {i < PIPE.length - 1 && <span className="font-pixel text-xs">→</span>}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="grid-bg">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <div className="font-pixel text-xs text-accent">live agent pipeline</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Six steps, two of them checked by code</h2>
          <ol className="mt-6 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {PIPE.map(([t, icon, d, k], i) => (
              <li key={t} id={`step-${t.toLowerCase()}`} className="group relative flex scroll-mt-20 flex-col bg-panel p-5 transition-colors hover:bg-panel-2">
                <div className="flex items-start justify-between">
                  <span className={`grain flex h-14 w-14 items-center justify-center ${k === "tested" ? "bg-field text-[#f4fff6]" : "bg-accent text-[#13221a]"}`}>
                    <PixelIcon name={icon} size={32} accent={k === "tested" ? "#13221a" : "var(--hot)"} />
                  </span>
                  <span className="font-pixel text-xs text-faint">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="font-pixel text-sm text-text">{t}</span>
                  {k === "tested" && <span className="border border-tested/50 px-1 font-mono text-[10px] text-tested">code-checked</span>}
                </div>
                <div className="mt-2 text-sm leading-relaxed text-muted">{d}</div>
              </li>
            ))}
          </ol>

          <div className="mt-16 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
            <section>
              <div className="font-pixel text-xs text-accent">evidence levels</div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Every claim wears a label</h2>
              <div className="mt-5 space-y-2">
                {LEVELS.map(([name, icon, cls, d]) => (
                  <div key={name} className="flex items-start gap-4 border border-line bg-panel p-4">
                    <PixelIcon name={icon} size={22} className={cls} accent="currentColor" />
                    <div>
                      <div className={`font-mono text-sm ${cls}`}>{name}</div>
                      <div className="mt-0.5 text-sm text-muted">{d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="font-pixel text-xs text-accent">who does what</div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Where the agent stops and you take over</h2>
              <div className="mt-5 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
                <div className="bg-panel p-5">
                  <div className="flex items-center gap-2 font-pixel text-xs text-agent">
                    <PixelIcon name="write" size={16} accent="currentColor" /> agent can
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-muted">
                    {AGENT.map((a) => (
                      <li key={a} className="flex gap-2">
                        <span className="text-agent">■</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-panel p-5">
                  <div className="flex items-center gap-2 font-pixel text-xs text-you">
                    <PixelIcon name="probe" size={16} accent="currentColor" /> you do
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-muted">
                    {YOU.map((a) => (
                      <li key={a} className="flex gap-2">
                        <span className="text-you">■</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-3 font-mono text-[11px] text-faint">The agent deliberately never signs in or creates accounts.</p>
            </section>
          </div>

          <section className="grain relative mt-16 overflow-hidden border-2 border-[#13221a] bg-field p-6 text-[#f4fff6] shadow-[6px_6px_0_#13221a] sm:p-8">
            <div className="font-pixel text-xs text-[#13221a]">scaling to 100 apps</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Same agent, a human on the inferred claims</h2>
            <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-white/90">
              Run the agent over Composio&apos;s OAuth toolkit list (managed and bring-your-own). A human reviews the inferred claims and timeline numbers before a guide is
              marked verified. Guides carry an &quot;accessed&quot; date per source, so a scheduled re-run can diff them when providers change.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
