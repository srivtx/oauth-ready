import { llmJSON, type ByoKey } from "@/lib/agent/llm";
import { PROVIDERS } from "@/lib/agent/providers";
import { CURATED, slugify } from "@/lib/guides";
import { ipOf, limiter } from "@/lib/ratelimit";
import { listGenerated } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const LIMIT = Number(process.env.RESOLVE_LIMIT_PER_HOUR ?? 60);
const allow = limiter(LIMIT);

// /compare: turn a messy list ("gmial vs msft teams, zendsk") into the apps it means, matched
// to library guides where they exist, so the rest can be researched live.
const SYSTEM = (library: string) => `You read a developer's list of apps they want to compare for OAuth app setup and return the apps they mean.

- Fix typos, nicknames and abbreviations: "gmial" is Gmail, "msft teams" is Microsoft Teams, "gh" is GitHub, "sfdc" is Salesforce.
- Return 1 to 3 apps, in the order typed. Ignore words that are not apps ("vs", "compare", "and", "which is easier").
- If an app is in the library below, set "slug" to its library slug exactly. Otherwise "slug" is null.
- "website" is the app's official domain, e.g. "zendesk.com".
- Skip anything that is not a real product. Never invent one.

Library (slug: name):
${library}

Reply with JSON only: {"apps":[{"typed":"what they wrote for it","name":"Official Name","slug":"gmail","website":"gmail.com"}]}`;

interface Body {
  text?: string;
  byo?: ByoKey | null;
}

interface Resolved {
  typed: string;
  name: string;
  slug: string | null;
  website: string | null;
}

export async function POST(req: Request) {
  const { text, byo } = (await req.json().catch(() => ({}))) as Body;
  const t = (text ?? "").trim();
  if (!t || t.length > 200) return Response.json({ error: "Name two or three apps (≤200 chars)." }, { status: 400 });
  const key = byo && typeof byo.apiKey === "string" && byo.apiKey.length > 8 && PROVIDERS.some((p) => p.id === byo.provider) ? byo : null;
  if (!key && !allow(ipOf(req))) return Response.json({ error: `Limit of ${LIMIT} comparisons an hour on the shared key.` }, { status: 429 });

  const library = [...CURATED, ...(await listGenerated())];
  const slugs = new Set(library.map((g) => g.slug));
  try {
    const r = await llmJSON<{ apps?: Partial<Resolved>[] }>(SYSTEM(library.map((g) => `${g.slug}: ${g.name}`).join("\n")), t, {
      tier: "fast",
      byo: key,
      think: false,
      signal: req.signal,
    });
    const seen = new Set<string>();
    const apps: Resolved[] = [];
    for (const a of r.data.apps ?? []) {
      const name = typeof a.name === "string" ? a.name.trim().slice(0, 60) : "";
      if (!name) continue;
      // Trust the model's slug only when it names a real guide; fall back to the name's slug.
      const slug = typeof a.slug === "string" && slugs.has(a.slug) ? a.slug : slugs.has(slugify(name)) ? slugify(name) : null;
      const id = slug ?? slugify(name);
      if (seen.has(id)) continue;
      seen.add(id);
      const site = typeof a.website === "string" ? a.website.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") : "";
      apps.push({ typed: typeof a.typed === "string" ? a.typed.slice(0, 60) : name, name, slug, website: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(site) ? site : null });
      if (apps.length === 3) break;
    }
    return Response.json({ apps, model: r.model });
  } catch (e) {
    let msg = String((e as Error).message);
    if (key) msg = msg.split(key.apiKey).join("[your key]");
    return Response.json({ error: msg.slice(0, 300) }, { status: 502 });
  }
}
