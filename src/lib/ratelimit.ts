// Calls on the site's own key are rate-limited per IP (best-effort, per server instance).
// Bring-your-own-key requests skip these.

export function limiter(perHour: number) {
  const hits = new Map<string, number[]>();
  return (ip: string): boolean => {
    const now = Date.now();
    // Forget visitors with nothing in the last hour, so the map doesn't grow for the server's life.
    if (hits.size > 1000) for (const [k, ts] of hits) if (now - ts[ts.length - 1] >= 3600_000) hits.delete(k);
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
    if (recent.length >= perHour) return false;
    recent.push(now);
    hits.set(ip, recent);
    return true;
  };
}

export const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
