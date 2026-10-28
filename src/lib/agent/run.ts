import type { AgentEvent, Blocker, Claim, Evidence, Guide, Phase, Probe, Scope, Source, Step } from "../types";
import { composioManaged, COMPOSIO_MANAGED_FETCHED } from "../data/managed";
import { slugify } from "../guides";
import { llmJSON, type ByoKey, type StreamEvent } from "./llm";
import { FOLLOW_SYSTEM, PLAN_SYSTEM, VERIFY_SYSTEM, WRITE_SYSTEM, planUser } from "./prompts";
import { DRAFT_SCHEMA, FOLLOW_SCHEMA, PLAN_SCHEMA, VERIFY_SCHEMA } from "./schema";
import { fetchLogo, linkAlive, probeAuthorize, probeDiscovery, readLlmsTxt, readPage, safeUrl, type Page, type ProbeResult } from "./web";
import { BRANDS } from "../brand";

interface Plan {
  name: string;
  slug: string;
  website: string;
  category: string;
  supportsOAuth: "yes" | "no" | "unclear";
  candidateUrls: { url: string; why: string }[];
  authorizeEndpointGuess?: string | null;
  oidcHosts: string[];
  developerPortal?: string | null;
}

type Draft = Omit<Guide, "slug" | "origin" | "generatedAt" | "model" | "managed" | "probes" | "sources" | "run"> & {
  probeNotes?: { url: string; meaning: string }[];
};

export interface RunOptions {
  emit: (e: AgentEvent) => void;
  byo?: ByoKey | null;
  signal?: AbortSignal;
}

const today = () => new Date().toISOString().slice(0, 10);
const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 90);
const kb = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

/** Models sometimes wrap the object ({"guide": {...}}) or return a one-element array. */
function unwrapDraft(raw: unknown): Draft {
  let v = Array.isArray(raw) ? raw[0] : raw;
  for (let i = 0; i < 2 && v && typeof v === "object" && !("verdict" in v) && !("steps" in v); i++) {
    const inner = Object.values(v as Record<string, unknown>).find((x) => x && typeof x === "object" && !Array.isArray(x) && ("verdict" in x || "steps" in x));
    if (!inner) break;
    v = inner;
  }
  return (v ?? {}) as Draft;
}

/** Run all tasks concurrently, yielding results in completion order. */
async function* streamed<T, R>(items: T[], fn: (t: T) => Promise<R>): AsyncGenerator<[T, R]> {
  const pending = new Map(items.map((it, i) => [i, fn(it).then((r) => [i, it, r] as const)]));
  while (pending.size) {
    const [i, it, r] = await Promise.race(pending.values());
    pending.delete(i);
    yield [it, r];
  }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[*_`#>|\\[\]()]/g, " ")
    .replace(/[“”"'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Does `quote` really occur in `text`? Exact after normalisation, or a 60-char core for long quotes. */
function quoteFound(quote: string, text: string): boolean {
  const q = norm(quote);
  if (q.length < 20) return false;
  const t = norm(text);
  if (t.includes(q)) return true;
  if (q.length > 90) {
    const mid = Math.floor(q.length / 2);
    return t.includes(q.slice(mid - 30, mid + 30));
  }
  return false;
}

export async function runAgent(input: string, { emit, byo, signal }: RunOptions): Promise<Guide> {
  const query = input.trim().slice(0, 120);
  const started = Date.now();
  let cost = 0;
  let tokens = 0;
  let tool = 0;
  const check = () => {
    if (signal?.aborted) throw new Error("Stopped by user");
  };
  const usage = (r: { cost: number; tokens: number; model: string }) => {
    cost += r.cost;
    tokens += r.tokens;
    emit({ type: "usage", tokens, costUsd: cost, model: r.model });
  };
  const onLlm = (e: StreamEvent) => {
    if (e.kind === "thinking") emit({ type: "thinking", text: e.text });
    else if (e.kind === "fallback") emit({ type: "log", level: "warn", text: `${e.from} unavailable (${e.reason}) — falling back` });
  };
  const run = (name: string, arg: string, url?: string) => {
    const id = `t${++tool}`;
    emit({ type: "tool", id, name, arg, status: "run", url });
    return (status: "ok" | "warn" | "err", result: string) => emit({ type: "tool", id, name, arg, status, result, url });
  };

  // What a complete guide needs evidence for. Coverage drives which links get followed next.
  const TOPICS: [string, RegExp][] = [
    ["registration", /create (an? )?(oauth )?app|register (an? )?app|client[ _-]?id|client[ _-]?secret|redirect[ _-]?ur[il]/gi],
    ["scopes", /\bscopes?\b|permissions?/gi],
    ["review", /app review|review process|verification|approv(al|ed)|submit (your|for)|marketplace|partner program/gi],
    ["limits", /rate[ -]?limit|quota|throttl|requests per/gi],
    ["tokens", /refresh[ _-]?token|access[ _-]?token|expir(es|y|ation)|token lifetime/gi],
    ["distribution", /publish|distribut|public app|install(ation)? (url|link|flow)|multi-?tenant/gi],
  ];
  const coverage = (texts: string[]) => {
    const all = texts.join("\n");
    return Object.fromEntries(TOPICS.map(([t, re]) => [t, (all.match(re)?.length ?? 0) >= 3])) as Record<string, boolean>;
  };
  const topicsIn = (s: string) => TOPICS.filter(([, re]) => new RegExp(re.source, "i").test(s)).map(([t]) => t);
  // Path words for matching a dead doc URL to a live one ("…/oauth/app-review" ≈ "…/apps/review-process").
  const STOP = new Set(["docs", "doc", "en", "us", "api", "apis", "html", "htm", "www", "com", "developer", "developers", "guide", "guides", "reference", "index"]);
  const words = (u: string) => {
    try {
      return new Set(new URL(u).pathname.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
    } catch {
      return new Set<string>();
    }
  };

  // 1. Plan ---------------------------------------------------------------
  emit({ type: "step", id: "plan", label: "Identify the app and plan research" });
  emit({ type: "status", verb: "Sizing up" });
  let homepage: string | undefined;
  const asUrl = safeUrl(/^https?:\/\//.test(query) ? query : query.includes(".") && !query.includes(" ") ? `https://${query}` : "");
  if (asUrl) {
    const done = run("Fetch", asUrl.hostname, asUrl.toString());
    const hp = await readPage(asUrl.toString(), 3000);
    if (hp.ok) homepage = `${hp.title}\n${hp.text}`;
    done(hp.ok ? "ok" : "warn", hp.ok ? hp.title : hp.status);
  }
  const planDone = run("Plan", query);
  const planRes = await llmJSON<Plan>(PLAN_SYSTEM, planUser(query, homepage), { tier: "fast", think: false, schema: PLAN_SCHEMA, byo, onEvent: onLlm, signal });
  usage(planRes);
  const plan = planRes.data;
  plan.slug = slugify(plan.slug || plan.name || query) || "app";
  plan.candidateUrls = Array.isArray(plan.candidateUrls) ? plan.candidateUrls : [];
  planDone("ok", `${plan.name} · ${plan.website} · OAuth: ${plan.supportsOAuth} · ${plan.candidateUrls.length} sources to check`);
  // Logo: known brands ship with the app; otherwise fetch once and embed it in the guide.
  const logo = BRANDS[plan.slug] ? undefined : await fetchLogo(plan.slug, plan.website);
  emit({ type: "identified", name: plan.name, slug: plan.slug, website: plan.website, logo });
  check();

  // 2. Read candidate sources + llms.txt ----------------------------------
  emit({ type: "step", id: "read", label: "Fetch and read candidate docs" });
  emit({ type: "status", verb: "Reading the docs" });
  const seen = new Set<string>();
  const pages: Page[] = [];
  // Docs sites repeat the same nav at the top of every page, so compare a slice from the middle
  // of the body, and only call it a duplicate when the title matches too (redirects, mirrors).
  const fingerprint = (p: Page) => {
    const t = p.text.replace(/\s+/g, " ");
    const mid = Math.floor(t.length * 0.45);
    return `${p.title}|${t.slice(mid, mid + 600)}`;
  };
  const accept = (p: Page): Page => (p.ok && pages.some((q) => fingerprint(q) === fingerprint(p)) ? { ...p, ok: false, status: "duplicate of a page already read" } : p);

  const dead: string[] = []; // 404s and failed reads, for link recovery
  const readAll = async (urls: string[], name = "Read") => {
    const rows = new Map(urls.map((u) => [u, run(name, short(u), u)]));
    for await (const [u, raw] of streamed(urls, (x) => readPage(x, 24000))) {
      const p = accept(raw);
      if (p.ok) pages.push(p);
      else if (p.status === "404" || p.status.startsWith("error: reader")) dead.push(u);
      rows.get(u)!(p.ok ? "ok" : "warn", p.ok ? `${kb(p.text.length)} chars · ${p.title}` : p.status);
    }
  };

  const candidates = plan.candidateUrls
    .map((c) => c?.url)
    .filter((u): u is string => !!u && !!safeUrl(u) && !seen.has(u) && !!seen.add(u))
    .slice(0, 8);
  const docHosts = [...new Set([plan.developerPortal, ...candidates].filter((u): u is string => !!u && !!safeUrl(u)).map((u) => new URL(u).hostname))].slice(0, 3);
  const [, llmsResults] = await Promise.all([
    readAll(candidates),
    Promise.all(
      docHosts.map(async (h) => {
        const done = run("Fetch", `${h}/llms.txt`);
        const r = await readLlmsTxt(h);
        done(r ? "ok" : "warn", r ? `${r.links.length} doc links indexed` : "not published");
        return r;
      }),
    ),
  ]);
  check();

  // 2b. Recover dead links: guessed doc URLs go stale, so look for the live page on the same
  // host whose path shares the most words (from llms.txt, then links on the pages we did read).
  if (dead.length) {
    const index = [...llmsResults.flatMap((r) => r?.links ?? []), ...pages.flatMap((p) => p.links)];
    const swaps: string[] = [];
    for (const d of dead.splice(0)) {
      let host = "";
      try {
        host = new URL(d).hostname;
      } catch {
        continue;
      }
      const want = words(d);
      const best = index
        .filter((l) => !seen.has(l.url) && !swaps.includes(l.url) && safeUrl(l.url) && new URL(l.url).hostname === host)
        .map((l) => {
          const have = words(l.url);
          const overlap = [...want].filter((w) => have.has(w) || l.text.toLowerCase().includes(w)).length;
          return { url: l.url, overlap };
        })
        .sort((a, b) => b.overlap - a.overlap)[0];
      if (best && best.overlap >= Math.min(2, want.size)) swaps.push(best.url);
    }
    if (swaps.length) {
      emit({ type: "status", verb: "Recovering dead links" });
      swaps.forEach((u) => seen.add(u));
      await readAll(swaps, "Recover");
      emit({ type: "log", level: "ok", text: `Recovered ${swaps.length} of the dead link(s) by matching them to live pages on the same docs site` });
    }
    check();
  }

  // 3. Follow the most relevant links -------------------------------------
  emit({ type: "step", id: "follow", label: "Follow links that look like OAuth / review docs" });
  emit({ type: "status", verb: "Following leads" });
  const linkPool = new Map<string, string>();
  for (const l of llmsResults.flatMap((r) => r?.links ?? [])) if (!seen.has(l.url)) linkPool.set(l.url, `[llms.txt] ${l.text}`);
  for (const p of pages) for (const l of p.links) if (!seen.has(l.url) && !linkPool.has(l.url)) linkPool.set(l.url, l.text);
  const strong = /oauth|authoriz|review|verif|scope|permission|submit|publish|marketplace|partner|consent|redirect|client[-_ ]?id|app[-_ ]?(creat|regist|approv)|rate.?limit/gi;
  const weak = /auth|app|distribut|limit|access|developer|security|privacy/i;
  const covered = coverage(pages.map((p) => p.text));
  const missing = TOPICS.map(([t]) => t).filter((t) => !covered[t]);
  emit({
    type: "log",
    level: missing.length ? "info" : "ok",
    text: `Coverage so far: ${TOPICS.map(([t]) => `${t} ${covered[t] ? "✓" : "✗"}`).join(" · ")}${missing.length ? ` — looking for ${missing.join(", ")}` : ""}`,
  });
  // Links that would fill a gap in coverage outrank links about topics we already have.
  const score = (s: string) =>
    (s.match(strong)?.length ?? 0) * 3 + (weak.test(s) ? 1 : 0) + (s.startsWith("[llms.txt]") ? 1 : 0) + topicsIn(s).filter((t) => missing.includes(t)).length * 4;
  const shortlist = [...linkPool.entries()]
    .map(([u, t]) => [u, t, score(u + " " + t)] as const)
    .filter(([, , s]) => s > 0)
    .sort((a, b) => b[2] - a[2])
    .slice(0, 70);
  const followCount = pages.length < 4 ? 7 : 5;
  if (shortlist.length) {
    const pick = run("Choose", `${shortlist.length} candidate links`);
    let picks: string[] = [];
    try {
      const r = await llmJSON<{ urls: string[] }>(
        FOLLOW_SYSTEM,
        `App: ${plan.name}\nAlready read: ${pages.map((p) => p.title).join("; ") || "nothing useful yet"}\nStill missing evidence for: ${missing.join(", ") || "nothing — pick the most authoritative pages"}. Prefer links that fill those gaps.\nPick up to ${followCount}.\nLinks:\n${shortlist.map(([u, t]) => `- ${t} — ${u}`).join("\n")}`,
        { tier: "fast", think: false, schema: FOLLOW_SCHEMA, byo, onEvent: onLlm, signal },
      );
      usage(r);
      picks = (r.data.urls ?? []).filter((u) => linkPool.has(u));
    } catch {
      picks = [];
    }
    if (picks.length === 0) {
      // Greedy: each pick should fill a topic the previous picks didn't.
      const left = new Set(missing);
      for (const [u, t] of shortlist) {
        if (picks.length >= followCount) break;
        const fills = topicsIn(u + " " + t).filter((x) => left.has(x));
        if (fills.length || left.size === 0) {
          picks.push(u);
          fills.forEach((x) => left.delete(x));
        }
      }
      for (const [u] of shortlist) if (picks.length < followCount && !picks.includes(u)) picks.push(u);
    }
    picks = picks.filter((u) => safeUrl(u) && !seen.has(u) && seen.add(u)).slice(0, followCount);
    pick("ok", `following ${picks.length}`);
    await readAll(picks);
    const after = coverage(pages.map((p) => p.text));
    const filled = missing.filter((t) => after[t]);
    const still = TOPICS.map(([t]) => t).filter((t) => !after[t]);
    if (missing.length)
      emit({
        type: "log",
        level: still.length ? "warn" : "ok",
        text: `${filled.length ? `Filled ${filled.join(", ")}` : "No new topics filled"}${still.length ? ` · still thin on ${still.join(", ")} (those claims will lean on inference)` : " · all topics covered"}`,
      });
  }
  if (pages.length === 0) emit({ type: "log", level: "warn", text: "No sources could be read — the guide will be marked low-confidence" });
  check();

  // 3b. Strip site chrome: lines repeated across several pages of the same host (nav menus,
  // footers) push the real content past the writer's and verifier's per-page budgets.
  {
    const byHost = new Map<string, Page[]>();
    for (const p of pages) {
      const h = new URL(p.url).hostname;
      byHost.set(h, [...(byHost.get(h) ?? []), p]);
    }
    let removed = 0;
    for (const group of byHost.values()) {
      if (group.length < 3) continue;
      const seenIn = new Map<string, number>();
      for (const p of group) for (const line of new Set(p.text.split("\n").map((l) => l.trim()).filter(Boolean))) seenIn.set(line, (seenIn.get(line) ?? 0) + 1);
      const chrome = new Set([...seenIn].filter(([, n]) => n >= Math.max(3, Math.ceil(group.length * 0.4))).map(([l]) => l));
      for (const p of group) {
        const before = p.text.length;
        p.text = p.text
          .split("\n")
          .filter((l) => !chrome.has(l.trim()))
          .join("\n")
          .replace(/\n{3,}/g, "\n\n");
        removed += before - p.text.length;
      }
    }
    if (removed > 2000) emit({ type: "log", level: "info", text: `Stripped ${kb(removed)} chars of repeated site navigation so the model reads the actual docs` });
  }

  // 4. Probe endpoints -----------------------------------------------------
  emit({ type: "step", id: "probe", label: "Probe the real OAuth endpoints" });
  emit({ type: "status", verb: "Poking endpoints" });
  const probes: ProbeResult[] = [];
  const hosts = new Set((Array.isArray(plan.oidcHosts) ? plan.oidcHosts : []).map((h) => String(h).replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean));
  await Promise.all(
    [...hosts].slice(0, 3).map(async (host) => {
      const done = run("Probe", `${host}/.well-known/openid-configuration`);
      const r = await probeDiscovery(host);
      probes.push(...r);
      const hit = r.find((x) => x.status === 200 && x.observed.startsWith("issuer"));
      done(hit ? "ok" : "warn", hit ? (hit.observed.split(";")[1]?.trim() ?? "found") : "no discovery document");
    }),
  );
  const discovered = probes.map((p) => p.observed.match(/authorization_endpoint=(\S+?);/)?.[1]).find((u) => u && u !== "?");
  // Prefer an explicit authorize URL from the docs, on the app's own domains only: docs often show a *third-party* authorize URL as an example
  // (Zendesk's "add OAuth to your app" page uses Todoist), which isn't this app's endpoint.
  const site = (u: string) => {
    try {
      return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.split(".").slice(-2).join(".");
    } catch {
      return "";
    }
  };
  const own = new Set([plan.website, ...hosts, ...pages.filter((p) => p.ok).map((p) => p.url)].map(site).filter(Boolean));
  const urlsInDocs = pages.flatMap((p) => p.text.match(/https:\/\/[a-z0-9.-]+\/[^\s)"'`<>]*/gi) ?? []).filter((u) => own.has(site(u)));
  // Not token/revoke endpoints (never probed), and not callbacks: those are where users land, not sign in.
  const notToken = (u: string) => !/token|revoke|introspect|userinfo|callback|redirect/i.test(u);
  const inDocs = urlsInDocs.find((u) => /authori[sz]e|\/authorization\b/i.test(u) && notToken(u)) ?? urlsInDocs.find((u) => /\/oauth2?\b/i.test(u) && notToken(u));
  const authorize = discovered || inDocs?.split("?")[0] || plan.authorizeEndpointGuess;
  if (authorize) {
    const done = run("Probe", `${short(authorize)}?client_id=fake`, authorize);
    const r = await probeAuthorize(authorize);
    if (r) probes.push(r);
    done(r?.status && r.status < 500 ? "ok" : "warn", r ? `${r.status ?? "no response"} · ${r.observed.slice(0, 110)}` : "blocked URL");
  }
  check();

  // 5. Write the guide -----------------------------------------------------
  emit({ type: "step", id: "write", label: "Write the guide from what was read" });
  emit({ type: "status", verb: "Thinking it through" });
  const sources: Source[] = pages.map((p, i) => ({
    id: `S${i + 1}`,
    title: p.title,
    url: p.url,
    kind: (() => {
      try {
        const root = new URL(plan.website).hostname.split(".").slice(-2).join(".");
        return p.url.includes(root) || /developer|docs\.|learn\.microsoft/.test(p.url) ? "official" : "third-party";
      } catch {
        return "official";
      }
    })(),
    accessed: today(),
  }));
  const budget = Math.max(4000, Math.floor(100_000 / Math.max(1, pages.length)));
  const sourceText = pages.map((p, i) => `[S${i + 1}] ${p.title}\nURL: ${p.url}\n${p.text.slice(0, budget)}`).join("\n\n---\n\n");
  const probeText = probes.map((p) => `- ${p.label}: GET ${p.url} → ${p.status ?? "n/a"}; ${p.observed}`).join("\n") || "(none)";
  const writeUser = `APP: ${plan.name} (${plan.website}) — planner thinks OAuth support is "${plan.supportsOAuth}".\n\nPROBES:\n${probeText}\n\nSOURCES:\n${sourceText || "(no sources could be fetched)"}`;
  let writing = run("Write", `guide from ${pages.length} sources + ${probes.length} probes`);
  let chars = 0;
  const onWrite = (e: StreamEvent) => {
    if (e.kind === "content") {
      if (e.chars - chars > 1500) {
        emit({ type: "status", verb: `Writing guide · ${kb(e.chars)} chars` });
        chars = e.chars;
      }
    } else onLlm(e);
  };
  let res = await llmJSON<unknown>(WRITE_SYSTEM, writeUser, { tier: "smart", schema: DRAFT_SCHEMA, byo, onEvent: onWrite, signal });
  usage(res);
  let draft = unwrapDraft(res.data);
  if (!draft.steps?.length || !draft.verdict?.headline) {
    writing("warn", `incomplete draft (keys: ${Object.keys(draft).slice(0, 6).join(", ") || "none"}) — retrying`);
    writing = run("Write", "retry with stricter instructions");
    chars = 0;
    res = await llmJSON<unknown>(WRITE_SYSTEM, `${writeUser}\n\nIMPORTANT: Return ONE top-level JSON object with exactly the keys in the schema, including "verdict" and "steps".`, {
      tier: "smart",
      schema: DRAFT_SCHEMA,
      byo,
      onEvent: onWrite,
      signal,
    });
    usage(res);
    draft = unwrapDraft(res.data);
    if (!draft.steps?.length) throw new Error("The model did not produce a usable guide. Try again, or pick another model in Settings.");
  }
  const writer = res.model;
  writing("ok", `${draft.steps.length} steps · ${draft.blockers?.length ?? 0} blockers · ${draft.gotchas?.length ?? 0} gotchas · by ${writer}`);
  check();

  // 6. Enforce evidence rules in code --------------------------------------
  emit({ type: "step", id: "check", label: "Verify quotes, citations and links" });
  emit({ type: "status", verb: "Fact-checking" });
  const ids = new Set(sources.map((s) => s.id));
  let downgraded = 0;
  const normId = (s: unknown) => {
    const t = String(s).replace(/[[\]\s]/g, "");
    if (/^probe$/i.test(t)) return "probe";
    const n = t.match(/^S?(\d+)$/i)?.[1];
    return n ? `S${n}` : t;
  };
  const normEvidence = (e: unknown): Evidence => {
    const t = String(e ?? "").toLowerCase();
    return t.startsWith("test") || t === "probe" ? "tested" : t.startsWith("source") || t === "cited" ? "sourced" : "inferred";
  };
  const fix = <T extends { evidence: Evidence; sources?: string[] }>(c: T): T => {
    const valid = [...new Set((Array.isArray(c.sources) ? c.sources : []).map(normId))].filter((s) => ids.has(s) || (s === "probe" && probes.length > 0));
    const claimed = normEvidence(c.evidence);
    let evidence = claimed;
    if (evidence === "tested" && !valid.includes("probe")) evidence = valid.length ? "sourced" : "inferred";
    if (evidence === "sourced" && valid.filter((s) => s !== "probe").length === 0) evidence = valid.includes("probe") ? "tested" : "inferred";
    if (evidence !== claimed) downgraded++;
    return { ...c, evidence, sources: valid };
  };
  const arr = <T,>(x: T[] | undefined) => (Array.isArray(x) ? x : []);
  const steps: Step[] = arr(draft.steps).map(fix);
  const requirements = arr(draft.requirements).map(fix) as Claim[];
  const scopes = arr(draft.scopes).map(fix) as Scope[];
  const gotchas = arr(draft.gotchas).map(fix) as Claim[];
  const blockers = arr(draft.blockers).map(fix) as Blocker[];
  const phases = arr(draft.phases).map(fix) as Phase[];
  const citeDone = run("Check", "citations point at pages actually read");
  citeDone(downgraded ? "warn" : "ok", downgraded ? `${downgraded} claim(s) downgraded: cited nothing that was read` : "all citations valid");

  // Quote verification: the model must produce a verbatim supporting sentence, and code checks it exists.
  type Target = { evidence: Evidence; sources?: string[]; quote?: string };
  const refs: { id: string; text: string; target: Target }[] = [];
  const collect = <T extends Target>(prefix: string, items: T[], describe: (x: T) => string) =>
    items.forEach((c, i) => {
      if (c.evidence === "sourced") refs.push({ id: `${prefix}${i}`, text: describe(c), target: c });
    });
  collect("step", steps, (s) => `${s.title}: ${s.detail}`);
  collect("req", requirements, (c) => c.text);
  collect("scope", scopes, (s) => `${s.name} (${s.tier}): ${s.note}`);
  collect("gotcha", gotchas, (c) => c.text);
  collect("blocker", blockers, (b) => `${b.problem} → ${b.fix}`);
  let verified = 0;
  if (refs.length && pages.length) {
    const vDone = run("Verify", `${refs.length} sourced claims against source text`);
    emit({ type: "status", verb: "Checking every quote" });
    const pageById = new Map(sources.map((s, i) => [s.id, pages[i]]));
    const cited = [...new Set(refs.flatMap((r) => r.target.sources ?? []))].filter((s) => pageById.has(s));
    const vBudget = Math.max(5000, Math.floor(90_000 / Math.max(1, cited.length)));
    try {
      const v = await llmJSON<{ checks: { id: string; quote: string }[] }>(
        VERIFY_SYSTEM,
        `CLAIMS:\n${refs.map((r) => `- id=${r.id} cites ${r.target.sources?.join(",")}: ${r.text}`).join("\n")}\n\nSOURCES:\n${cited.map((id) => `[${id}]\n${pageById.get(id)!.text.slice(0, vBudget)}`).join("\n\n---\n\n")}`,
        { tier: "fast", think: false, schema: VERIFY_SCHEMA, byo, onEvent: onLlm, signal },
      );
      usage(v);
      const quotes = new Map(arr(v.data.checks).map((c) => [c.id, c.quote ?? ""]));
      for (const r of refs) {
        const q = quotes.get(r.id) ?? "";
        const hit = q ? (r.target.sources ?? []).find((s) => pageById.has(s) && quoteFound(q, pageById.get(s)!.text)) : undefined;
        if (hit) {
          r.target.quote = q.trim().slice(0, 320);
          r.target.sources = [hit, ...(r.target.sources ?? []).filter((s) => s !== hit)];
          verified++;
        } else {
          r.target.evidence = "inferred";
          downgraded++;
        }
      }
      vDone(verified === refs.length ? "ok" : "warn", `${verified}/${refs.length} quotes found verbatim · ${refs.length - verified} downgraded to inferred`);
    } catch (e) {
      vDone("warn", `skipped: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // What each page actually backed: claims citing it, and quotes verified in it.
  const allClaims: { sources?: string[]; quote?: string; evidence: Evidence }[] = [...steps, ...requirements, ...scopes, ...gotchas, ...blockers, ...phases];
  sources.forEach((src) => {
    const citing = allClaims.filter((c) => c.sources?.includes(src.id));
    const verifiedHere = citing.filter((c) => c.quote && c.sources?.[0] === src.id).length;
    emit({ type: "sourceUse", url: src.url, claims: citing.length, verified: verifiedHere });
  });
  const unused = sources.filter((src) => !allClaims.some((c) => c.sources?.includes(src.id))).length;
  if (sources.length)
    emit({ type: "log", level: "info", text: `${sources.length - unused} of ${sources.length} pages read ended up backing claims${unused ? ` · ${unused} read but not cited` : ""}` });

  const linkTargets = steps.filter((s) => s.url && !sources.some((src) => src.url === s.url));
  if (linkTargets.length) {
    const lDone = run("Check", `${linkTargets.length} links in steps`);
    let dead = 0;
    await Promise.all(
      linkTargets.map(async (s) => {
        if (!(await linkAlive(s.url!))) {
          dead++;
          s.url = undefined;
        }
      }),
    );
    lDone(dead ? "warn" : "ok", dead ? `removed ${dead} dead link(s)` : "all reachable");
  }

  const managed = composioManaged(plan.slug) || composioManaged(plan.name);
  sources.push({ id: "composio", title: "Composio — Managed OAuth apps directory", url: "https://docs.composio.dev/toolkits/managed-auth", kind: "official", accessed: COMPOSIO_MANAGED_FETCHED });
  if (probes.length) sources.push({ id: "probe", title: "Live HTTP probes run by the agent (dummy client_id, no credentials)", url: "", kind: "probe", accessed: today() });

  const notes = new Map(arr(draft.probeNotes).map((n) => [n.url, n.meaning]));
  return {
    slug: plan.slug,
    name: draft.name || plan.name,
    website: draft.website || plan.website,
    category: draft.category || plan.category,
    origin: "agent",
    generatedAt: new Date().toISOString(),
    model: writer,
    logo,
    run: { costUsd: cost, tokens, seconds: Math.round((Date.now() - started) / 1000), pagesRead: pages.length, quotesVerified: verified, claimsChecked: refs.length },
    verdict: {
      difficulty: Math.min(5, Math.max(1, Math.round(Number(draft.verdict?.difficulty) || 3))) as Guide["verdict"]["difficulty"],
      label: draft.verdict?.label ?? "Unclear",
      headline: draft.verdict?.headline ?? "",
    },
    timeToDev: draft.timeToDev ?? "unknown",
    timeToProd: draft.timeToProd ?? "unknown",
    managed: {
      composio: managed,
      note: managed
        ? "Composio lists a managed OAuth app for this toolkit — you can ship on it while your own app is set up or reviewed."
        : "Not in Composio's managed-OAuth list — you'll need your own OAuth app (or it isn't a Composio toolkit yet).",
    },
    paths: arr(draft.paths),
    phases,
    steps,
    requirements,
    scopes,
    gotchas,
    blockers,
    probes: probes.map<Probe>((p) => ({ ...p, meaning: notes.get(p.url) ?? "", at: today() })),
    sources,
    uncertainties: [
      ...arr(draft.uncertainties),
      ...(pages.length < 2 ? ["Very few sources could be read; treat this guide as a starting point only."] : []),
      "Generated automatically; no app was registered and no review was submitted.",
    ],
  };
}
