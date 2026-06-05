import { hexPoints } from "../lib/hex";

interface HexBadgeProps {
  /** pixel size (width) of the hexagon */
  size?: number;
  fill: string;
  stroke: string;
  label: string;
  pulse?: boolean;
}

/** A single pointy-top hexagon used as a node emblem. */
export default function HexBadge({ size = 56, fill, stroke, label, pulse }: HexBadgeProps) {
  const R = 20;
  const w = Math.sqrt(3) * R;
  const pad = 3;
  const cx = w / 2 + pad;
  const cy = R + pad;
  const vbW = w + pad * 2;
  const vbH = 2 * R + pad * 2;
  const px = (size / vbW) * vbH;

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      width={size}
      height={px}
      className="shrink-0"
      aria-hidden
    >
      <polygon
        points={hexPoints(cx, cy, R)}
        fill={fill}
        stroke={stroke}
        strokeWidth={2.5}
        className={pulse ? "animate-pulse" : undefined}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={700}
        fill={stroke}
      >
        {label}
      </text>
    </svg>
  );
}
