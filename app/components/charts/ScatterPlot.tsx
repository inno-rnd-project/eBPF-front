"use client";

import {
  AXIS_COLOR,
  DEFAULT_MARGINS,
  DEFAULT_VIEW,
  GRID_COLOR,
  LABEL_COLOR,
  heatColor,
  niceTicks,
  scaleLinear,
} from "./chartUtils";

export interface ScatterPoint {
  x: number;
  y: number;
  /** 0–1 → color along the heat ramp (e.g. GPU utilization) */
  c?: number;
  title?: string;
}

interface ScatterPlotProps {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  height?: number;
  color?: string;
}

export default function ScatterPlot({
  points,
  xLabel,
  yLabel,
  xFormat = (v) => v.toFixed(0),
  yFormat = (v) => v.toFixed(0),
  height = DEFAULT_VIEW.height,
  color = "#38bdf8",
}: ScatterPlotProps) {
  const width = DEFAULT_VIEW.width;
  const m = { ...DEFAULT_MARGINS, bottom: 36, left: 48 };
  if (points.length === 0) return null;

  const xMax = Math.max(1, ...points.map((p) => p.x));
  const yMax = Math.max(1, ...points.map((p) => p.y));
  const xScale = scaleLinear([0, xMax], [m.left, width - m.right]);
  const yScale = scaleLinear([0, yMax], [height - m.bottom, m.top]);
  const xTicks = niceTicks(0, xMax, 6);
  const yTicks = niceTicks(0, yMax, 5);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
      {yTicks.map((ty) => (
        <g key={`y${ty}`}>
          <line x1={m.left} y1={yScale(ty)} x2={width - m.right} y2={yScale(ty)} stroke={GRID_COLOR} />
          <text x={m.left - 6} y={yScale(ty)} textAnchor="end" dominantBaseline="central" fontSize={10} fill={LABEL_COLOR}>
            {yFormat(ty)}
          </text>
        </g>
      ))}
      {xTicks.map((tx) => (
        <text key={`x${tx}`} x={xScale(tx)} y={height - m.bottom + 16} textAnchor="middle" fontSize={10} fill={LABEL_COLOR}>
          {xFormat(tx)}
        </text>
      ))}

      {points.map((p, i) => (
        <circle key={i} cx={xScale(p.x)} cy={yScale(p.y)} r={4} fill={p.c != null ? heatColor(p.c) : color} fillOpacity={0.75} stroke="#09090b" strokeWidth={0.5}>
          {p.title ? <title>{p.title}</title> : null}
        </circle>
      ))}

      <line x1={m.left} y1={m.top} x2={m.left} y2={height - m.bottom} stroke={AXIS_COLOR} />
      <line x1={m.left} y1={height - m.bottom} x2={width - m.right} y2={height - m.bottom} stroke={AXIS_COLOR} />

      <text x={(m.left + width - m.right) / 2} y={height - 4} textAnchor="middle" fontSize={11} fill={LABEL_COLOR}>
        {xLabel}
      </text>
      <text x={14} y={(m.top + height - m.bottom) / 2} textAnchor="middle" fontSize={11} fill={LABEL_COLOR} transform={`rotate(-90 14 ${(m.top + height - m.bottom) / 2})`}>
        {yLabel}
      </text>
    </svg>
  );
}
