// Hand-drawn 9×9 pixel icons. "#" is ink (currentColor), "o" is the accent.
// Inside a `.group`, hovering the group makes the pixels pop in a quick wave.

const ICONS = {
  // Identify the app, plan sources: a clipboard checklist.
  plan: ["...ooo...", ".##ooo##.", ".#.....#.", ".#o.##.#.", ".#.....#.", ".#o.##.#.", ".#.....#.", ".#o.##.#.", ".#######."],
  // Read docs: an open book.
  read: [".........", ".##...##.", "#..#.#..#", "#oo#.#oo#", "#..#.#..#", "#oo#.#oo#", "#..#.#..#", "#########", "....#...."],
  // Follow links: one node branching to two.
  follow: ["......##.", "......##.", ".....#...", "ooo.#....", "ooo#.....", "ooo.#....", ".....#...", "......##.", "......##."],
  // Probe the real endpoints: a plug.
  probe: ["..#...#..", "..#...#..", ".#######.", ".#.....#.", ".#..o..#.", "..#.o.#..", "...###...", "....#....", "....#...."],
  // Write the guide: a pencil and the line it drew.
  write: ["......##.", ".....#oo#", "....#oo#.", "...#..#..", "..#..#...", ".#..#....", ".#.#.....", ".##......", "....####."],
  // Check quotes and links: a shield with a tick.
  check: [".#######.", ".#.....#.", ".#....o#.", ".#...o.#.", ".#o.o..#.", ".#.o...#.", "..#...#..", "...#.#...", "....#...."],
  // Verification log
  doc: [".#####...", ".#...##..", ".#....##.", ".#.....#.", ".#.ooo.#.", ".#.....#.", ".#.ooo.#.", ".#.....#.", ".#######."],
  flask: ["..#####..", "...#.#...", "...#.#...", "..#...#..", ".#.....#.", "#...o...#", "#ooooooo#", "#ooooooo#", ".#######."],
  cross: ["#.......#", ".#.....#.", "..#...#..", "...#.#...", "....o....", "...#.#...", "..#...#..", ".#.....#.", "#.......#"],
  tick: [".........", "........#", ".......#.", "......#..", "#....#...", ".#..#....", "..oo.....", "..o......", "........."],
  ask: ["..#####..", ".#.....#.", ".......#.", "......#..", "....##...", "....#....", ".........", "....o....", "........."],
  // Search-box commands
  game: [".#######.", ".#ooooo#.", ".#ooooo#.", ".#ooooo#.", ".#######.", ".#.#...#.", ".###.o.#.", ".#.#..o#.", ".#######."],
  dice: ["#########", "#.......#", "#.o...o.#", "#.......#", "#...o...#", "#.......#", "#.o...o.#", "#.......#", "#########"],
  gear: ["....#....", ".#.###.#.", "..#...#..", ".#.ooo.#.", "##.o.o.##", ".#.ooo.#.", "..#...#..", ".#.###.#.", "....#...."],
  versus: [".........", "######...", "######...", ".........", "ooooooooo", "ooooooooo", ".........", "###......", "###......"],
  chat: [".........", "#########", "#.......#", "#.o.o.o.#", "#.......#", "#########", ".##......", ".#.......", "........."],
} as const;

export type IconName = keyof typeof ICONS;

export function PixelIcon({ name, size = 24, accent = "var(--accent)", className = "" }: { name: IconName; size?: number; accent?: string; className?: string }) {
  const rows = ICONS[name];
  return (
    <svg viewBox="0 0 9 9" width={size} height={size} shapeRendering="crispEdges" aria-hidden className={`px-icon shrink-0 ${className}`}>
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "." ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={c === "o" ? accent : "currentColor"} style={{ animationDelay: `${(x + y) * 25}ms` }} />
          ),
        ),
      )}
    </svg>
  );
}
