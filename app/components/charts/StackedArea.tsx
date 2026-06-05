"use client";

import ChartFrame from "./ChartFrame";
import {
  DEFAULT_MARGINS,
  DEFAULT_VIEW,
  hhmm,
  niceTicks,
  scaleLinear,
} from "./chartUtils";

interface StageMetaLite {
  key: string;
  label: string;
  color: string;
}

interface StackPoint {
  t: number;
  stages: Record<string, number>;
}

interface StackedAreaProps {
  data: StackPoint[];
  stages: StageMetaLite[];
  height?: number;
  valueFormat?: (v: number) => string;
  xTickCount?: number;
}

export default function StackedArea({
  data,
  stages,
  height = DEFAULT_VIEW.height,
  valueFormat = (v) => v.toFixed(1),
  xTickCount = 6,
}: StackedAreaProps) {
  const width = DEFAULT_VIEW.width;
  const m = DEFAULT_MARGINS;
  const n = data.length;

  const totals = data.map((d) => stages.reduce((s, st) => s + (d.stages[st.key] ?? 0), 0));
  const yMax = Math.max(1, ...totals);

  const xScale = scaleLinear([0, Math.max(1, n - 1)], [m.left, width - m.right]);
  const yScale = scaleLinear([0, yMax], [height - m.bottom, m.top]);
  const yTicks = niceTicks(0, yMax, 5);

  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const idx = Math.round((i / (xTickCount - 1)) * (n - 1));
    return { value: idx, label: hhmm(data[idx]?.t ?? 0) };
  });

  // build stacked polygons bottom→top
  const cumLower = new Array(n).fill(0);
  const polys = stages.map((st) => {
    const upper = data.map((d, i) => cumLower[i] + (d.stages[st.key] ?? 0));
    const top = data.map((_, i) => `${xScale(i).toFixed(2)},${yScale(upper[i]).toFixed(2)}`);
    const bottom = data
      .map((_, i) => `${xScale(i).toFixed(2)},${yScale(cumLower[i]).toFixed(2)}`)
      .reverse();
    const path = `M${top.join(" L")} L${bottom.join(" L")} Z`;
    for (let i = 0; i < n; i++) cumLower[i] = upper[i];
    return { st, path };
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
            <div className="mb-1 flex items-center justify-between gap-4 font-medium text-zinc-300">
              <span>{hhmm(data[i]?.t ?? 0)}</span>
              <span className="tabular-nums">총 {valueFormat(totals[i])}</span>
            </div>
            {[...stages].reverse().map((st) => (
              <div key={st.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="h-2 w-2 rounded-sm" style={{ background: st.color }} />
                  {st.label}
                </span>
                <span className="tabular-nums font-medium text-zinc-100">
                  {valueFormat(data[i]?.stages[st.key] ?? 0)}
                </span>
              </div>
            ))}
          </div>
        ),
      }}
    >
      {polys.map(({ st, path }) => (
        <path key={st.key} d={path} fill={st.color} fillOpacity={0.82} stroke={st.color} strokeWidth={0.5} />
      ))}
    </ChartFrame>
  );
}
