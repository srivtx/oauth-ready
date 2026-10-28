// Calls on the site's own key are rate-limited per IP (best-effort, per server instance).
// Bring-your-own-key requests skip these.

export function limiter(perHour: number) {
  const hits = new Map<string, number[]>();
  return (ip: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
    if (recent.length >= perHour) return false;
    recent.push(now);
    hits.set(ip, recent);
    return true;
  };
}

export const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
