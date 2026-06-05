interface GaugeProps {
  value: number;
  max: number;
  label: string;
  display: string; // formatted center value
  color: string;
  size?: number;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)]; // y-up
}

/** Arc from a0 to a1 (degrees), drawn clockwise on screen (decreasing angle). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** 180° semicircle gauge (180° left → 0° right, over the top). */
export default function Gauge({ value, max, label, display, color, size = 120 }: GaugeProps) {
  const w = size;
  const h = size * 0.62;
  const cx = w / 2;
  const cy = h - 6;
  const r = w / 2 - 8;
  const f = Math.max(0, Math.min(1, value / max));
  const endAngle = 180 - f * 180;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img">
        <path d={arc(cx, cy, r, 180, 0)} fill="none" stroke="#27272a" strokeWidth={9} strokeLinecap="round" />
        {f > 0 && (
          <path d={arc(cx, cy, r, 180, endAngle)} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" />
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={17} fontWeight={700} fill="#fafafa">
          {display}
        </text>
      </svg>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}
