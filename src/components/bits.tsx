import type { Evidence, Owner } from "@/lib/types";

const EVIDENCE: Record<Evidence, { label: string; cls: string; tip: string }> = {
  tested: { label: "tested", cls: "text-tested border-tested/40 bg-tested/10", tip: "Observed directly by a live probe or attempt" },
  sourced: { label: "sourced", cls: "text-sourced border-sourced/40 bg-sourced/10", tip: "Stated in a cited source that was read" },
  inferred: { label: "inferred", cls: "text-inferred border-inferred/40 border-dashed", tip: "Judgement or estimate — verify before relying on it" },
};

export function EvidenceTag({ e, sources, quote }: { e: Evidence; sources?: string[]; quote?: string }) {
  const meta = EVIDENCE[e] ?? EVIDENCE.inferred;
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span title={quote ? `${meta.tip}\n\nVerified quote: “${quote}”` : meta.tip} className={` border px-1.5 py-px font-mono text-[10px] uppercase tracking-wider ${meta.cls}`}>
        {meta.label}
        {quote ? " ❝" : ""}
      </span>
      {sources?.map((s) => (
        <a key={s} href={`#src-${s}`} className="font-mono text-[10px] text-faint hover:text-text">
          [{s}]
        </a>
      ))}
    </span>
  );
}

const OWNER: Record<Owner, { label: string; cls: string; icon: string }> = {
  agent: { label: "agent", cls: "text-agent border-agent/40 bg-agent/10", icon: "◆" },
  you: { label: "you", cls: "text-you border-you/40 bg-you/10", icon: "●" },
  provider: { label: "provider", cls: "text-provider border-provider/40 bg-provider/10", icon: "◷" },
};

export function OwnerTag({ o }: { o: Owner }) {
  const m = OWNER[o] ?? OWNER.you;
  return (
    <span className={`inline-flex items-center gap-1 border px-1.5 py-px font-mono text-[10px] uppercase tracking-wider ${m.cls}`}>
      <span aria-hidden>{m.icon}</span>
      {m.label}
    </span>
  );
}

const LEVELS = ["", "Self-serve", "Light review", "Review gate", "Partner-gated", "Security audit"];
const LEVEL_COLOR = ["", "bg-tested", "bg-tested", "bg-you", "bg-hot", "bg-danger"];

export function Difficulty({ level, size = "md" }: { level: number; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-2.5" : "h-5";
  return (
    <div className="flex items-center gap-2" title={`Difficulty ${level}/5 — ${LEVELS[level]}`}>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`${h} ${size === "sm" ? "w-2.5" : "w-5"} ${i <= level ? LEVEL_COLOR[level] : "bg-line"}`} />
        ))}
      </div>
      <span className="font-mono text-xs text-muted">{level}/5</span>
    </div>
  );
}

export function SectionTitle({ n, children, id }: { n: string; children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-4 flex scroll-mt-20 items-baseline gap-3 text-lg font-semibold tracking-tight">
      <span className="font-pixel text-xs text-accent">{n}</span>
      {children}
    </h2>
  );
}

/** A verbatim sentence from the source that the agent's checker found in the page text. */
export function Quote({ q, src }: { q?: string; src?: string[] }) {
  if (!q) return null;
  return (
    <blockquote className="mt-2 border-l-2 border-sourced/40 pl-3 text-xs italic leading-relaxed text-muted">
      “{plain(q)}”{" "}
      {src?.filter((s) => s !== "probe").slice(0, 1).map((s) => (
        <a key={s} href={`#src-${s}`} className="not-italic font-mono text-[10px] text-faint hover:text-text">
          — [{s}] verified verbatim
        </a>
      ))}
    </blockquote>
  );
}

/** Renders `code` and **bold** from model/curated text; everything else stays plain. */
export function Md({ text }: { text: string }) {
  const parts = String(text ?? "").split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <code key={i} className=" bg-panel-2 px-1 py-px font-mono text-[0.88em] text-text">
            {p.slice(1, -1)}
          </code>
        ) : p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <strong key={i} className="font-semibold text-text">
            {p.slice(2, -2)}
          </strong>
        ) : (
          p
        ),
      )}
    </>
  );
}

export const plain = (s: string) => s.replace(/\*\*|__|`/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[|\]/g, "").trim();
