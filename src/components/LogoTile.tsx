import { brandOf, tileColor } from "@/lib/brand";
import type { Guide } from "@/lib/types";
import { PixelLogo } from "./pixel";

/** Brand-tinted grain tile holding the pixelated logo. */
export function LogoTile({ g, className = "", n = 34 }: { g: Pick<Guide, "slug" | "name" | "logo" | "brandColor">; className?: string; n?: number }) {
  const b = brandOf(g);
  const bg = tileColor(b.color);
  return (
    <div className={`grain relative overflow-hidden ${className}`} style={{ background: `linear-gradient(160deg, ${bg} 0%, color-mix(in srgb, ${bg} 62%, #0a100c) 100%)` }}>
      <PixelLogo src={b.logo} seed={g.slug} n={n} label={`${g.name} logo`} className="absolute inset-0 h-full w-full" />
      {!b.logo && (
        <span className="absolute inset-0 flex items-center justify-center font-pixel text-4xl text-white/90">{g.name.slice(0, 1)}</span>
      )}
    </div>
  );
}

/** Crisp, small, authentic mark for inline use next to names. */
export function Mark({ g, size = 18 }: { g: Pick<Guide, "slug" | "logo" | "brandColor" | "name">; size?: number }) {
  const b = brandOf(g);
  if (!b.logo) return null;
  const isSvgMark = b.logo.endsWith(".svg") || b.logo.startsWith("data:image/svg");
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={b.logo} alt="" width={size} height={size} className="inline-block shrink-0" style={isSvgMark ? { filter: "invert(1)" } : { borderRadius: 3 }} />;
}
