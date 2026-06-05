// ---------------------------------------------------------------------------
// Pointy-top hexagon geometry for the honeycomb layout.
//
// Pointy-top hexagons tessellate in rows; every odd row is shifted right by
// half a hex width so the cells interlock. Layout is computed in abstract SVG
// units and the <svg> viewBox scales the whole honeycomb to its container.
// ---------------------------------------------------------------------------

export interface HexCell {
  cx: number;
  cy: number;
}

export interface Honeycomb {
  cells: HexCell[];
  width: number;
  height: number;
  cols: number;
  rows: number;
  R: number;
}

/** Vertices of a pointy-top hexagon centered at (cx, cy) with circumradius R. */
export function hexPoints(cx: number, cy: number, R: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90); // -90° puts a vertex at the top
    const x = cx + R * Math.cos(angle);
    const y = cy + R * Math.sin(angle);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(" ");
}

/** Choose a column count that keeps the honeycomb compact and roughly square. */
function colsFor(count: number): number {
  if (count <= 3) return Math.max(1, count);
  return Math.min(6, Math.ceil(Math.sqrt(count) * 1.4));
}

/**
 * Pack `count` hexagons into an interlocking honeycomb and return per-cell
 * centers plus the overall viewBox size.
 */
export function layoutHoneycomb(count: number, R = 22, pad = 6): Honeycomb {
  const cols = colsFor(count);
  const rows = Math.max(1, Math.ceil(count / cols));
  const w = Math.sqrt(3) * R; // hex width (flat-to-flat)
  const cells: HexCell[] = [];

  for (let k = 0; k < count; k++) {
    const row = Math.floor(k / cols);
    const col = k % cols;
    const cx = pad + w / 2 + col * w + (row % 2) * (w / 2);
    const cy = pad + R + row * 1.5 * R;
    cells.push({ cx, cy });
  }

  const width = pad * 2 + cols * w + (rows > 1 ? w / 2 : 0);
  const height = pad * 2 + 2 * R + (rows - 1) * 1.5 * R;
  return { cells, width, height, cols, rows, R };
}
