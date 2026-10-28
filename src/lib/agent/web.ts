// Reading pages and probing endpoints. Everything here is a plain GET to a
// public URL; the agent never signs in or submits forms.

export interface Page {
  url: string;
  ok: boolean;
  status: string; // "ok" | "404" | "error: ..."
  title: string;
  text: string;
  links: { text: string; url: string }[];
}

const UA = "OAuthReadyBot/1.0 (+guide generator; read-only)";

/** Reject non-http(s), localhost and private-network targets (user input reaches fetch). */
export function safeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return null; // IP literals
    if (!h.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

const NOT_FOUND = /(^|\n)(Title:.*\b(404|not found|page not found)\b|#\s*404\b)|Target URL returned error 404|West of a white house/i;

export async function readPage(raw: string, maxChars = 14000): Promise<Page> {
  const u = safeUrl(raw);
  const empty = { url: raw, title: "", text: "", links: [] };
  if (!u) return { ...empty, ok: false, status: "error: blocked url" };
  const headers: Record<string, string> = { "X-Return-Format": "markdown", "User-Agent": UA };
  if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  try {
    const res = await fetch(`https://r.jina.ai/${u.toString()}`, { headers, signal: AbortSignal.timeout(30_000) });
    const body = await res.text();
    if (!res.ok) return { ...empty, ok: false, status: res.status === 404 ? "404" : `error: reader ${res.status}` };
    if (NOT_FOUND.test(body.slice(0, 3000))) return { ...empty, ok: false, status: "404" };
    const content = body.includes("Markdown Content:") ? body.slice(body.indexOf("Markdown Content:") + 17) : body;
    // Raw .md docs come back without a Title: line; fall back to the first heading.
    const title =
      body.match(/^Title:[ \t]*(\S.*)$/m)?.[1]?.trim() ||
      content.match(/^#{1,2}\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, "").trim() ||
      u.pathname.split("/").filter(Boolean).pop()?.replace(/\.md$/, "").replace(/[-_]/g, " ") ||
      u.hostname;
    if (/^(log ?in|sign ?in|sign ?up)\b|\b(log ?in|sign ?in) (and|&) (sign ?in|log ?in)\b/i.test(title)) return { ...empty, ok: false, status: "error: login page" };
    const links = extractLinks(content, u);
    const text = content
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    // JS-rendered shells come back as nav text only; require some real prose.
    const prose = text.split("\n").filter((l) => l.trim().length > 80).join(" ").length;
    if (text.length < 400 || prose < 300) return { ...empty, ok: false, status: "error: empty or JS-only page" };
    return { url: u.toString(), ok: true, status: "ok", title, text: text.slice(0, maxChars), links };
  } catch (e) {
    return { ...empty, ok: false, status: `error: ${(e as Error).name === "TimeoutError" ? "timeout" : (e as Error).message}` };
  }
}

function extractLinks(md: string, base: URL) {
  const out = new Map<string, string>();
  for (const m of md.matchAll(/\[([^\]]{2,120})\]\((https?:\/\/[^)\s]+)\)/g)) {
    const url = m[2].split("#")[0];
    if (/\.(png|jpe?g|svg|gif|webp|ico)(\?|$)/i.test(url)) continue;
    if (!out.has(url)) out.set(url, m[1].replace(/[*_`]/g, "").trim());
  }
  const root = base.hostname.split(".").slice(-2).join(".");
  return [...out.entries()]
    .map(([url, text]) => ({ url, text }))
    .filter((l) => {
      try {
        return new URL(l.url).hostname.endsWith(root) || /learn\.microsoft\.com|developers?\./.test(l.url);
      } catch {
        return false;
      }
    })
    .slice(0, 150);
}

/**
 * llms.txt (llmstxt.org) is a curated, LLM-oriented index many doc sites now
 * publish. When present it's the best map of a provider's docs we can get.
 */
export async function readLlmsTxt(host: string): Promise<{ url: string; links: { text: string; url: string }[] } | null> {
  const url = `https://${host}/llms.txt`;
  if (!safeUrl(url)) return null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text")) return null;
    const body = (await res.text()).slice(0, 200_000);
    if (/<html|<!doctype/i.test(body.slice(0, 500))) return null;
    const links = [...body.matchAll(/\[([^\]]{2,140})\]\((https?:\/\/[^)\s]+)\)(?::\s*([^\n]{0,160}))?/g)].map((m) => ({
      url: m[2].split("#")[0],
      text: `${m[1]}${m[3] ? ` — ${m[3]}` : ""}`,
    }));
    return links.length ? { url, links } : null;
  } catch {
    return null;
  }
}

export interface ProbeResult {
  label: string;
  url: string;
  status: number | null;
  observed: string;
}

/** OIDC / RFC 8414 discovery on a host. */
export async function probeDiscovery(host: string): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  for (const p of ["/.well-known/openid-configuration", "/.well-known/oauth-authorization-server"]) {
    const url = `https://${host}${p}`;
    if (!safeUrl(url)) continue;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
      const ct = res.headers.get("content-type") ?? "";
      if (res.ok && ct.includes("json")) {
        const j = await res.json();
        results.push({
          label: `Discovery document (${p})`,
          url,
          status: res.status,
          observed: `issuer=${j.issuer ?? "?"}; authorization_endpoint=${j.authorization_endpoint ?? "?"}; token_endpoint=${j.token_endpoint ?? "?"}; scopes_supported=${(j.scopes_supported ?? []).slice(0, 12).join(" ") || "n/a"}`,
        });
        return results;
      }
      results.push({ label: `Discovery document (${p})`, url, status: res.status, observed: res.ok ? `non-JSON (${ct})` : "not published" });
    } catch (e) {
      results.push({ label: `Discovery document (${p})`, url, status: null, observed: `unreachable: ${(e as Error).message}` });
    }
  }
  return results;
}

/** Hit an authorize endpoint with an obviously fake client_id and record what happens. */
export async function probeAuthorize(endpoint: string): Promise<ProbeResult | null> {
  const u = safeUrl(endpoint);
  if (!u) return null;
  u.searchParams.set("client_id", "probe_invalid_client");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", "https://example.com/callback");
  try {
    const res = await fetch(u, { redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000) });
    const loc = res.headers.get("location");
    let observed = loc ? `redirect → ${loc.slice(0, 160)}` : `${res.headers.get("content-type") ?? ""}`;
    if (!loc) {
      const body = (await res.text()).slice(0, 4000);
      const err = body.match(/(invalid_client|invalid_request|unauthorized_client|client[_ ]id[^<"]{0,60}|not found|error[^<"]{0,80})/i)?.[0];
      observed += err ? ` — body mentions "${err.trim()}"` : " — HTML/login page";
    } else {
      const authError = new URL(loc, u).searchParams.get("authError");
      if (authError) {
        try {
          observed += ` (authError decodes to: ${Buffer.from(authError, "base64").toString("utf8").replace(/[^\x20-\x7e]+/g, " ").trim().slice(0, 100)})`;
        } catch {}
      }
    }
    return { label: "Authorize endpoint with a fake client_id", url: u.toString(), status: res.status, observed };
  } catch (e) {
    return { label: "Authorize endpoint with a fake client_id", url: u.toString(), status: null, observed: `unreachable: ${(e as Error).message}` };
  }
}

/** Cheap liveness check for links the guide will show. */
export async function linkAlive(raw: string): Promise<boolean> {
  const u = safeUrl(raw);
  if (!u) return false;
  try {
    const res = await fetch(u, { redirect: "follow", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) });
    return res.status < 400 || res.status === 401 || res.status === 403 || res.status === 405 || res.status === 429;
  } catch {
    return true; // network flake ≠ dead link; don't drop it
  }
}

/**
 * Fetch a logo for an app at generation time and return it as a data: URI, so the
 * guide is self-contained and viewers never hit a third-party icon service.
 * Order: Simple Icons (clean vector mark) → the site's favicon via Google's favicon service.
 */
export async function fetchLogo(slug: string, website: string): Promise<string | undefined> {
  const tries: string[] = [];
  const s = slug.replace(/[^a-z0-9]/g, "");
  if (s) tries.push(`https://cdn.jsdelivr.net/npm/simple-icons@13.21.0/icons/${s}.svg`);
  try {
    const host = new URL(website).hostname.replace(/^www\./, "");
    tries.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
  } catch {}
  for (const url of tries) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5_000) });
      if (!res.ok) continue;
      const type = (res.headers.get("content-type") ?? "").split(";")[0];
      if (!/^image\/(svg\+xml|png|x-icon|vnd\.microsoft\.icon|jpeg|webp)$/.test(type)) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      // Google returns a ~700-byte generic globe for unknown sites; skip it.
      if (buf.length < 900 && type !== "image/svg+xml") continue;
      if (buf.length > 60_000) continue;
      return `data:${type};base64,${buf.toString("base64")}`;
    } catch {}
  }
  return undefined;
}
