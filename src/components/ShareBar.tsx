"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ShareBar({ markdown, slug, name, canRegenerate }: { markdown: string; slug: string; name: string; canRegenerate: boolean }) {
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 1600);
  };
  const btn = " border border-line bg-panel px-3 py-1.5 font-mono text-xs text-muted hover:border-muted hover:text-text";
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button className={btn} onClick={async () => (await navigator.clipboard.writeText(location.href), flash("link copied"))}>
        copy link
      </button>
      <button className={btn} onClick={async () => (await navigator.clipboard.writeText(markdown.replace("{{URL}}", location.href)), flash("markdown copied"))}>
        copy as markdown
      </button>
      <button
        className={btn}
        onClick={() => {
          const blob = new Blob([markdown.replace("{{URL}}", location.href)], { type: "text/markdown" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${slug}-oauth-guide.md`;
          a.click();
        }}
      >
        download .md
      </button>
      <button className={btn} onClick={() => window.print()}>
        print / pdf
      </button>
      {canRegenerate && (
        <button className={`${btn} border-agent/40 text-agent`} onClick={() => router.push(`/generate?q=${encodeURIComponent(name)}&fresh=1`)}>
          ↻ re-run agent
        </button>
      )}
      {msg && <span className="font-mono text-xs text-accent">{msg}</span>}
    </div>
  );
}
