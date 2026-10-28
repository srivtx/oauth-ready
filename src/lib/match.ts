// Matching what someone typed to a library app by spelling: "gmial" → Gmail. Shared by the search
// box (when the AI resolver can't be reached) and the 404 page's "did you mean".

type Named = { name: string; slug: string };

/** The ways an app gets written: its name, its slug, and a long enough first word. */
export function namesOf(a: Named): string[] {
  const names = new Set([a.name.toLowerCase(), a.slug.replace(/-/g, " "), a.slug]);
  const first = a.name.toLowerCase().split(/\s+/)[0];
  if (first.length > 3) names.add(first);
  return [...names];
}

/** Edit distance where swapping two neighbouring letters counts once ("gmial" is 1 from "gmail"). */
function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** Closest library app to a misspelt word, if one is close enough. */
export function fuzzyApp<T extends Named>(word: string, apps: T[]): T | undefined {
  let best: [number, T] | undefined;
  for (const a of apps)
    for (const n of namesOf(a)) {
      const d = lev(word, n);
      if (d <= (n.length >= 7 ? 2 : 1) && (!best || d < best[0])) best = [d, a];
    }
  return best?.[1];
}
