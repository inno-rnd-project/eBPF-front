"use client";

import { hhmm, heatColor, LABEL_COLOR } from "./chartUtils";

export interface HeatRow {
  uid: string;
  label: string;
  sub?: string;
  values: number[];
}

interface HeatmapProps {
  rows: HeatRow[];
  times: number[];
  valueFormat?: (v: number) => string;
  colorMax?: number;
  selectedUid?: string | null;
  onSelect?: (uid: string) => void;
}

const LABEL_W = 150;
const CELL_W = 16;
const ROW_H = 16;
const AXIS_H = 18;

export default function Heatmap({
  rows,
  times,
  valueFormat = (v) => v.toFixed(1),
  colorMax,
  selectedUid,
  onSelect,
}: HeatmapProps) {
  if (rows.length === 0) {
    return <div className="py-6 text-center text-xs text-zinc-600">데이터 없음</div>;
  }
  const cols = times.length;
  const max = colorMax ?? Math.max(1, ...rows.flatMap((r) => r.values));
  const width = LABEL_W + cols * CELL_W;
  const height = rows.length * ROW_H + AXIS_H;

  // a few x labels
  const xLabelCount = 6;
  const xLabels = Array.from({ length: xLabelCount }, (_, i) => {
    const idx = Math.round((i / (xLabelCount - 1)) * (cols - 1));
    return { idx, label: hhmm(times[idx] ?? 0) };
  });

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="block" role="img">
        {rows.map((row, r) => {
          const y = r * ROW_H;
          const selected = row.uid === selectedUid;
          return (
            <g key={row.uid} className={onSelect ? "cursor-pointer" : undefined} onClick={() => onSelect?.(row.uid)}>
              <text
                x={LABEL_W - 6}
                y={y + ROW_H / 2}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={10}
                fill={selected ? "#fafafa" : "#a1a1aa"}
              >
                {row.label.length > 26 ? row.label.slice(0, 25) + "…" : row.label}
              </text>
              {row.values.map((v, c) => (
                <rect
                  key={c}
                  x={LABEL_W + c * CELL_W}
                  y={y + 1}
                  width={CELL_W - 1}
                  height={ROW_H - 2}
                  fill={heatColor(v / max)}
                >
                  <title>
                    {row.label} @ {hhmm(times[c] ?? 0)}: {valueFormat(v)}
                  </title>
                </rect>
              ))}
              {selected && (
                <rect
                  x={LABEL_W}
                  y={y + 0.5}
                  width={cols * CELL_W}
                  height={ROW_H - 1}
                  fill="none"
                  stroke="#fafafa"
                  strokeWidth={1}
                />
              )}
            </g>
          );
        })}

        {xLabels.map((xl, i) => (
          <text
            key={i}
            x={LABEL_W + xl.idx * CELL_W + CELL_W / 2}
            y={rows.length * ROW_H + 12}
            textAnchor="middle"
            fontSize={9}
            fill={LABEL_COLOR}
          >
            {xl.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
