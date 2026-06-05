// Shared helpers for the lightweight SVG charts. All charts draw into a fixed
// abstract viewBox and let the <svg> scale to its container (same strategy as
// the honeycomb). Coordinates below are in viewBox units.

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_VIEW = { width: 720, height: 280 };
export const DEFAULT_MARGINS: Margins = { top: 12, right: 16, bottom: 28, left: 44 };

export interface Scale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
}

export function scaleLinear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const fn = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/** "Nice" evenly spaced ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) {
    ticks.push(Math.abs(v) < step / 1e6 ? 0 : +v.toFixed(6));
  }
  return ticks;
}

export function linePath(pts: Array<{ x: number; y: number }>): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

export function areaPath(
  pts: Array<{ x: number; y: number }>,
  baselineY: number,
): string {
  if (pts.length === 0) return "";
  const up = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${up} L${last.x.toFixed(2)} ${baselineY.toFixed(2)} L${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

/** HH:MM label from unix seconds (UTC, deterministic for SSR). */
export function hhmm(t: number): string {
  const d = new Date(t * 1000);
  const h = d.getUTCHours().toString().padStart(2, "0");
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** Interpolate a value in [0,1] across a cool→warm heat ramp, returns rgb(). */
export function heatColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  // teal (#0f766e-ish) → amber → rose
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [13, 50, 60]],
    [0.4, [16, 185, 129]],
    [0.7, [251, 191, 36]],
    [1.0, [244, 63, 94]],
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (x >= stops[i][0] && x <= stops[i + 1][0]) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const f = (x - a[0]) / (b[0] - a[0] || 1);
  const c = a[1].map((ch, i) => Math.round(ch + (b[1][i] - ch) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Diverging ramp for correlation r in [-1, 1]: sky (neg) → dark (0) → rose (pos). */
export function divergeColor(r: number): string {
  const x = Math.max(-1, Math.min(1, r));
  const mid: [number, number, number] = [24, 24, 27]; // zinc-900
  const pos: [number, number, number] = [244, 63, 94]; // rose-500
  const neg: [number, number, number] = [56, 189, 248]; // sky-400
  const target = x >= 0 ? pos : neg;
  const f = Math.abs(x);
  const c = mid.map((ch, i) => Math.round(ch + (target[i] - ch) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export const AXIS_COLOR = "#3f3f46"; // zinc-700
export const GRID_COLOR = "#27272a"; // zinc-800
export const LABEL_COLOR = "#71717a"; // zinc-500
