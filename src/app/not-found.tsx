import { PixelScatter } from "@/components/pixel";
import { CURATED } from "@/lib/guides";
import { listGenerated } from "@/lib/store";
import { Lost } from "./Lost";

export const metadata = { title: "Not found · OAuth Ready" };

export default async function NotFound() {
  // Names only, so a mistyped guide link can offer the one it probably meant.
  const generated = await listGenerated();
  const apps = [...CURATED, ...generated.filter((g) => !CURATED.some((c) => c.slug === g.slug))].map((g) => ({ slug: g.slug, name: g.name }));
  return (
    <main>
      {/* Same green poster band as the home page, with the pieces still falling. */}
      <section className="field grain relative overflow-hidden">
        <PixelScatter seed="404" className="opacity-80" drift />
        <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16">
          <Lost apps={apps} />
        </div>
      </section>
    </main>
  );
}
