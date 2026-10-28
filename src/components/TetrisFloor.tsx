// The footer's floor: locked Tetris pieces stacked along the bottom, a quiet echo of the
// pieces drifting down in the hero. Static and deterministic.

const ROWS = [
  "....aa......g.........a.........gg.....a.......aa....g.......",
  "g..aag..a..gg...aa...aaa..g....gga....aa..gg..aag...ggg..a..g",
  "gg.gggaaa.ggaa.ggaa.gggga.gga.aggaa.gggaagga.ggggaa.gaggaaa.gg",
];

export function TetrisFloor() {
  // Tile the pattern wide enough for any screen; the SVG crops it with square cells.
  const rows = ROWS.map((r) => r.padEnd(62, ".").repeat(4));
  return (
    <svg aria-hidden viewBox={`0 0 ${rows[0].length} ${rows.length}`} preserveAspectRatio="xMinYMax slice" className="block h-6 w-full sm:h-8" shapeRendering="crispEdges">
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "." ? null : (
            <rect key={`${x}-${y}`} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} fill={c === "a" ? "var(--accent)" : "var(--field)"} opacity={c === "g" ? 0.7 : 0.85} />
          ),
        ),
      )}
    </svg>
  );
}
