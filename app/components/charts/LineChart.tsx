"use client";

import { type Series } from "../../lib/telemetry";
import ChartFrame from "./ChartFrame";
import {
  DEFAULT_MARGINS,
  DEFAULT_VIEW,
  hhmm,
  linePath,
  niceTicks,
  scaleLinear,
} from "./chartUtils";

interface LineChartProps {
  series: Series[];
  height?: number;
  valueFormat?: (v: number) => string;
  /** number of x-axis labels */
  xTickCount?: number;
}

export default function LineChart({
  series,
  height = DEFAULT_VIEW.height,
  valueFormat = (v) => v.toFixed(1),
  xTickCount = 6,
}: LineChartProps) {
  const width = DEFAULT_VIEW.width;
  const m = DEFAULT_MARGINS;
  const base = series[0]?.points ?? [];
  const n = base.length;

  const yMax = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.v)));
  const xScale = scaleLinear([0, Math.max(1, n - 1)], [m.left, width - m.right]);
  const yScale = scaleLinear([0, yMax], [height - m.bottom, m.top]);
  const yTicks = niceTicks(0, yMax, 5);

  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const idx = Math.round((i / (xTickCount - 1)) * (n - 1));
    return { value: idx, label: hhmm(base[idx]?.t ?? 0) };
  });

  return (
    <ChartFrame
      width={width}
      height={height}
      margins={m}
      xScale={xScale}
      yScale={yScale}
      xTicks={xTicks}
      yTicks={yTicks}
      yFormat={valueFormat}
      hover={{
        count: n,
        xAt: (i) => xScale(i),
        tooltip: (i) => (
          <div className="space-y-0.5">
            <div className="mb-1 font-medium text-zinc-300">{hhmm(base[i]?.t ?? 0)}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="tabular-nums font-medium text-zinc-100">
                  {valueFormat(s.points[i]?.v ?? 0)}
                </span>
              </div>
            ))}
          </div>
        ),
      }}
    >
      {series.map((s) => (
        <path
          key={s.key}
          d={linePath(s.points.map((p, i) => ({ x: xScale(i), y: yScale(p.v) })))}
          fill="none"
          stroke={s.color}
          strokeWidth={1.75}
          strokeLinejoin="round"
        />
      ))}
    </ChartFrame>
  );
}
