"use client";

import { type HistogramBucket } from "../../lib/telemetry";
import {
  AXIS_COLOR,
  DEFAULT_MARGINS,
  DEFAULT_VIEW,
  GRID_COLOR,
  LABEL_COLOR,
  niceTicks,
  scaleLinear,
} from "./chartUtils";

interface Marker {
  value: number;
  label: string;
  color: string;
}

interface HistogramProps {
  buckets: HistogramBucket[];
  color?: string;
  height?: number;
  xFormat?: (v: number) => string;
  markers?: Marker[];
}

export default function Histogram({
  buckets,
  color = "#38bdf8",
  height = 220,
  xFormat = (v) => v.toFixed(1),
  markers = [],
}: HistogramProps) {
  const width = DEFAULT_VIEW.width;
  const m = DEFAULT_MARGINS;
  if (buckets.length === 0) return null;

  const x0 = buckets[0].x0;
  const x1 = buckets[buckets.length - 1].x1;
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  const xScale = scaleLinear([x0, x1], [m.left, width - m.right]);
  const yScale = scaleLinear([0, maxCount], [height - m.bottom, m.top]);
  const yTicks = niceTicks(0, maxCount, 4);
  const xTicks = niceTicks(x0, x1, 6);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
      {yTicks.map((ty) => (
        <g key={`y${ty}`}>
          <line x1={m.left} y1={yScale(ty)} x2={width - m.right} y2={yScale(ty)} stroke={GRID_COLOR} />
          <text x={m.left - 6} y={yScale(ty)} textAnchor="end" dominantBaseline="central" fontSize={10} fill={LABEL_COLOR}>
            {ty}
          </text>
        </g>
      ))}

      {buckets.map((b, i) => {
        const bx = xScale(b.x0);
        const bw = Math.max(1, xScale(b.x1) - xScale(b.x0) - 1);
        const by = yScale(b.count);
        return (
          <rect key={i} x={bx} y={by} width={bw} height={height - m.bottom - by} fill={color} fillOpacity={0.8}>
            <title>
              {xFormat(b.x0)}–{xFormat(b.x1)}: {b.count}
            </title>
          </rect>
        );
      })}

      {markers.map((mk, i) => {
        const x = xScale(mk.value);
        return (
          <g key={`m${i}`}>
            <line x1={x} y1={m.top} x2={x} y2={height - m.bottom} stroke={mk.color} strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={x + 3} y={m.top + 10} fontSize={10} fill={mk.color}>
              {mk.label} {xFormat(mk.value)}
            </text>
          </g>
        );
      })}

      {xTicks.map((tx, i) => (
        <text key={`x${i}`} x={xScale(tx)} y={height - m.bottom + 16} textAnchor="middle" fontSize={10} fill={LABEL_COLOR}>
          {xFormat(tx)}
        </text>
      ))}

      <line x1={m.left} y1={m.top} x2={m.left} y2={height - m.bottom} stroke={AXIS_COLOR} />
      <line x1={m.left} y1={height - m.bottom} x2={width - m.right} y2={height - m.bottom} stroke={AXIS_COLOR} />
    </svg>
  );
}
