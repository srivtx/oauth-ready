"use client";

import { useEffect, useState } from "react";
import type { Step } from "@/lib/types";
import { EvidenceTag, Md, OwnerTag, Quote } from "./bits";

// Checklist progress is a per-viewer convenience, kept in localStorage.
export function Steps({ slug, steps }: { slug: string; steps: Step[] }) {
  const key = `oauthready:${slug}:done`;
  const [done, setDone] = useState<number[]>([]);
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(key) ?? "[]"));
    } catch {}
  }, [key]);
  const toggle = (i: number) => {
    const next = done.includes(i) ? done.filter((d) => d !== i) : [...done, i];
    setDone(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };

  const groups: { title: string; m: Step["milestone"] }[] = [
    { title: "Get a working connection", m: "dev" },
    { title: "Make it production-ready", m: "prod" },
  ];

  return (
    <div className="space-y-8">
      <div className="font-mono text-xs text-muted">
        {done.length}/{steps.length} done
        <span className="ml-2 inline-block h-1.5 w-32 overflow-hidden bg-line align-middle">
          <span className="block h-full bg-accent transition-all" style={{ width: `${(done.length / Math.max(steps.length, 1)) * 100}%` }} />
        </span>
      </div>
      {groups.map(({ title, m }) => {
        const items = steps.map((s, i) => [s, i] as const).filter(([s]) => s.milestone === m);
        if (!items.length) return null;
        return (
          <div key={m}>
            <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-faint">{title}</h3>
            <ol className="space-y-3">
              {items.map(([s, i]) => (
                <li key={i} className={` border border-line bg-panel p-4 transition ${done.includes(i) ? "opacity-50" : ""}`}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggle(i)}
                      aria-label={done.includes(i) ? "Mark not done" : "Mark done"}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border font-mono text-xs ${done.includes(i) ? "border-accent bg-accent text-bg" : "border-line hover:border-muted"}`}
                    >
                      {done.includes(i) ? "✓" : ""}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium"><Md text={s.title} /></span>
                        <OwnerTag o={s.owner} />
                        <EvidenceTag e={s.evidence} sources={s.sources} quote={s.quote} />
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted"><Md text={s.detail} /></p>
                      <Quote q={s.quote} src={s.sources} />
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all font-mono text-xs text-accent hover:underline">
                          ↗ {s.url.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                      {s.artifact && <ArtifactBox a={s.artifact} />}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

function ArtifactBox({ a }: { a: NonNullable<Step["artifact"]> }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(a.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="mt-3 border border-agent/30 bg-agent/5">
      <div className="flex items-center justify-between border-b border-agent/20 px-3 py-1.5">
        <span className="font-mono text-[11px] text-agent">◆ prepared by agent · {a.label}</span>
        <div className="flex gap-3">
          {a.kind === "link" && (
            <a href={a.content} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-agent hover:underline">
              open ↗
            </a>
          )}
          <button onClick={copy} className="font-mono text-[11px] text-muted hover:text-text">
            {copied ? "copied" : "copy"}
          </button>
        </div>
      </div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[11px] leading-relaxed text-muted">
        {a.kind === "link" ? decodeURIComponent(a.content) : a.content}
      </pre>
    </div>
  );
}
