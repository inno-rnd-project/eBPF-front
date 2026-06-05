"use client";

import { type ReactNode, useRef, useState } from "react";
import {
  AXIS_COLOR,
  GRID_COLOR,
  LABEL_COLOR,
  type Margins,
  type Scale,
} from "./chartUtils";

export interface HoverConfig {
  /** number of discrete x positions (e.g. time samples) */
  count: number;
  /** viewBox x coordinate of index i */
  xAt: (i: number) => number;
  /** tooltip content for index i */
  tooltip: (i: number) => ReactNode;
}

interface ChartFrameProps {
  width: number;
  height: number;
  margins: Margins;
  xScale: Scale;
  yScale: Scale;
  xTicks: { value: number; label: string }[];
  yTicks: number[];
  yFormat?: (v: number) => string;
  children: ReactNode;
  hover?: HoverConfig;
}

export default function ChartFrame({
  width,
  height,
  margins,
  xScale,
  yScale,
  xTicks,
  yTicks,
  yFormat = (v) => `${v}`,
  children,
  hover,
}: ChartFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const plotLeft = margins.left;
  const plotRight = width - margins.right;
  const plotTop = margins.top;
  const plotBottom = height - margins.bottom;

  function onMove(e: React.MouseEvent) {
    if (!hover || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < hover.count; i++) {
      const d = Math.abs(hover.xAt(i) - vbX);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setActive(best);
  }

  const activeX = hover && active != null ? hover.xAt(active) : null;

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setActive(null)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        onMouseMove={onMove}
        role="img"
      >
        {/* y grid + labels */}
        {yTicks.map((ty) => {
          const y = yScale(ty);
          return (
            <g key={`y${ty}`}>
              <line x1={plotLeft} y1={y} x2={plotRight} y2={y} stroke={GRID_COLOR} strokeWidth={1} />
              <text
                x={plotLeft - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={10}
                fill={LABEL_COLOR}
              >
                {yFormat(ty)}
              </text>
            </g>
          );
        })}

        {/* x ticks + labels */}
        {xTicks.map((tx, i) => {
          const x = xScale(tx.value);
          return (
            <g key={`x${i}`}>
              <line x1={x} y1={plotBottom} x2={x} y2={plotBottom + 4} stroke={AXIS_COLOR} strokeWidth={1} />
              <text x={x} y={plotBottom + 16} textAnchor="middle" fontSize={10} fill={LABEL_COLOR}>
                {tx.label}
              </text>
            </g>
          );
        })}

        {/* axes */}
        <line x1={plotLeft} y1={plotTop} x2={plotLeft} y2={plotBottom} stroke={AXIS_COLOR} strokeWidth={1} />
        <line x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} stroke={AXIS_COLOR} strokeWidth={1} />

        {/* series content */}
        {children}

        {/* crosshair */}
        {activeX != null && (
          <line
            x1={activeX}
            y1={plotTop}
            x2={activeX}
            y2={plotBottom}
            stroke="#a1a1aa"
            strokeWidth={1}
            strokeDasharray="3 3"
            pointerEvents="none"
          />
        )}
      </svg>

      {/* tooltip (HTML, positioned by percentage so it tracks responsive scaling) */}
      {hover && active != null && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900/95 px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: `${(hover.xAt(active) / width) * 100}%` }}
        >
          {hover.tooltip(active)}
        </div>
      )}
    </div>
  );
}
