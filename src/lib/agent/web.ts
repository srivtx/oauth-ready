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

// Pages read recently, per server instance: repeat runs, compares and chat re-read the same docs.
const pageCache = new Map<string, { at: number; page: Page }>();
const PAGE_TTL = 6 * 3600_000;

/**
 * Read a page as Markdown through Jina Reader. Pages that come back empty because they only render
 * with JavaScript get one more try in a real browser. Successful reads are cached for a few hours.
 */
export async function readPage(raw: string, maxChars = 14000): Promise<Page> {
  const key = raw.split("#")[0];
  const hit = pageCache.get(key);
  if (hit && Date.now() - hit.at < PAGE_TTL) return { ...hit.page, text: hit.page.text.slice(0, maxChars) };
  let page = await readOnce(raw, false);
  if (page.status === "error: empty or JS-only page") {
    const rendered = await readOnce(raw, true);
    if (rendered.ok) page = rendered;
  }
  if (page.ok) {
    if (pageCache.size > 400) pageCache.delete(pageCache.keys().next().value!);
    pageCache.set(key, { at: Date.now(), page });
  }
  return { ...page, text: page.text.slice(0, maxChars) };
}

async function readOnce(raw: string, browser: boolean): Promise<Page> {
  const maxChars = 40000;
  const u = safeUrl(raw);
  const empty = { url: raw, title: "", text: "", links: [] };
  if (!u) return { ...empty, ok: false, status: "error: blocked url" };
  const headers: Record<string, string> = { "X-Return-Format": "markdown", "User-Agent": UA };
  if (browser) headers["X-Engine"] = "browser";
  if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  try {
    const go = () => fetch(`https://r.jina.ai/${u.toString()}`, { headers, signal: AbortSignal.timeout(browser ? 40_000 : 30_000) });
    let res = await go();
    // The reader rate-limits bursts (a run reads many pages at once): back off once and retry.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
      res = await go();
    }
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

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Web search. Exa's hosted search (the one OpenCode's own websearch tool uses) needs no key;
 * EXA_API_KEY lifts its rate limit. JINA_API_KEY adds Jina search as a fallback. Returns null
 * when no search answered, so callers fall back to the docs sitemap.
 */
export async function searchWeb(query: string, objective: string, signal?: AbortSignal): Promise<SearchHit[] | null> {
  const sig = () => (signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000));
  try {
    const key = process.env.EXA_API_KEY ? `?exaApiKey=${encodeURIComponent(process.env.EXA_API_KEY)}` : "";
    const res = await fetch(`https://mcp.exa.ai/mcp${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "web_search_exa", arguments: { query: query.slice(0, 300), objective: objective.slice(0, 600), numResults: 8 } },
      }),
      signal: sig(),
    });
    const body = await res.text();
    const json = body.includes("data:") ? body.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop() : body;
    const r = JSON.parse(json ?? "{}") as { result?: { content?: { text?: string }[]; isError?: boolean } };
    const text = r.result?.isError ? "" : (r.result?.content ?? []).map((c) => c.text ?? "").join("\n---\n");
    const hits = text
      .split(/\n---\n/)
      .map((block) => {
        const url = block.match(/^URL:\s*(\S+)/m)?.[1]?.split("#")[0] ?? "";
        const title = block.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? "";
        const snippet = (block.split(/^Highlights:\s*$/m)[1] ?? "").replace(/\s+/g, " ").trim();
        return { url, title: title === "N/A" ? "" : title.slice(0, 160), snippet: snippet.slice(0, 600) };
      })
      .filter((h) => h.url && safeUrl(h.url));
    if (hits.length) return hits;
  } catch {
    if (signal?.aborted) return null;
  }
  if (!process.env.JINA_API_KEY) return null;
  try {
    const res = await fetch(`https://s.jina.ai/?q=${encodeURIComponent(query.slice(0, 200))}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${process.env.JINA_API_KEY}`, "X-Respond-With": "no-content" },
      signal: sig(),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { title?: string; url?: string; description?: string }[] };
    const hits = (j.data ?? [])
      .filter((r) => r.url && safeUrl(r.url))
      .slice(0, 8)
      .map((r) => ({ title: (r.title ?? "").slice(0, 160), url: r.url!.split("#")[0], snippet: (r.description ?? "").slice(0, 600) }));
    return hits.length ? hits : null;
  } catch {
    return null;
  }
}

/**
 * Every page URL a docs site lists in its sitemap (robots.txt "Sitemap:" lines, else /sitemap.xml),
 * following sitemap indexes a little way. A real map of the site, so the agent picks pages that
 * exist instead of guessing paths. Capped so a huge site can't stall a run.
 */
export async function readSitemap(host: string): Promise<string[]> {
  const root = safeUrl(`https://${host}/`);
  if (!root) return [];
  const get = async (url: string): Promise<string> => {
    if (!safeUrl(url)) return "";
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) });
      if (!res.ok || !res.body) return "";
      const stream = url.endsWith(".gz") && !(res.headers.get("content-encoding") ?? "").includes("gzip") ? res.body.pipeThrough(new DecompressionStream("gzip")) : res.body;
      const reader = stream.getReader();
      const dec = new TextDecoder();
      let text = "";
      while (text.length < 3_000_000) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
      return text;
    } catch {
      return "";
    }
  };
  const robots = await get(`https://${host}/robots.txt`);
  const listed = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const queue = listed.length ? listed.slice(0, 4) : [`https://${host}/sitemap.xml`];
  const pages = new Set<string>();
  const loc = (xml: string) => [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  // Child sitemaps that look like docs go first: "sitemap-docs.xml" before "sitemap-blog.xml".
  const docsy = (u: string) => (/doc|develop|api|guide|help|support|reference/i.test(u) ? 0 : /blog|news|press|career|job|event|customer|partner-directory|[a-z]{2}-[a-z]{2}/i.test(u) ? 2 : 1);
  let fetched = 0;
  while (queue.length && fetched < 6 && pages.size < 20000) {
    const xml = await get(queue.shift()!);
    fetched++;
    if (/<sitemapindex/i.test(xml)) queue.push(...loc(xml).sort((a, b) => docsy(a) - docsy(b)).slice(0, 8));
    else for (const u of loc(xml)) if (pages.size < 20000) pages.add(u.split("#")[0]);
    queue.sort((a, b) => docsy(a) - docsy(b));
  }
  return [...pages].filter((u) => safeUrl(u));
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
