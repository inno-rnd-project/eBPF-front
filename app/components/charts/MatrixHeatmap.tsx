"use client";

import { type CorrelationMatrix } from "../../lib/telemetry";
import { divergeColor } from "./chartUtils";

interface MatrixHeatmapProps {
  matrix: CorrelationMatrix;
  selectedUid?: string | null;
  onSelect?: (uid: string) => void;
}

const LABEL_W = 150;
const TOP_H = 96;
const CELL = 24;

/** Square Pearson-correlation matrix with a diverging color scale. */
export default function MatrixHeatmap({ matrix, selectedUid, onSelect }: MatrixHeatmapProps) {
  const { entities, r } = matrix;
  const n = entities.length;
  if (n === 0) return <div className="py-6 text-center text-xs text-zinc-600">데이터 없음</div>;

  const width = LABEL_W + n * CELL;
  const height = TOP_H + n * CELL;
  const selIdx = entities.findIndex((e) => e.uid === selectedUid);

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="block" role="img">
        {/* top (column) labels, rotated */}
        {entities.map((e, c) => {
          const x = LABEL_W + c * CELL + CELL / 2;
          const active = c === selIdx;
          return (
            <text
              key={`c${e.uid}`}
              x={x}
              y={TOP_H - 6}
              fontSize={10}
              fill={active ? "#fafafa" : "#a1a1aa"}
              transform={`rotate(-45 ${x} ${TOP_H - 6})`}
              className={onSelect ? "cursor-pointer" : undefined}
              onClick={() => onSelect?.(e.uid)}
            >
              {e.label.length > 14 ? e.label.slice(0, 13) + "…" : e.label}
            </text>
          );
        })}

        {entities.map((row, i) => {
          const y = TOP_H + i * CELL;
          const rowActive = i === selIdx;
          return (
            <g key={`r${row.uid}`}>
              <text
                x={LABEL_W - 6}
                y={y + CELL / 2}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={10}
                fill={rowActive ? "#fafafa" : "#a1a1aa"}
                className={onSelect ? "cursor-pointer" : undefined}
                onClick={() => onSelect?.(row.uid)}
              >
                {row.label.length > 22 ? row.label.slice(0, 21) + "…" : row.label}
              </text>
              {entities.map((col, j) => {
                const val = r[i][j];
                return (
                  <rect
                    key={col.uid}
                    x={LABEL_W + j * CELL}
                    y={y}
                    width={CELL - 1}
                    height={CELL - 1}
                    fill={divergeColor(val)}
                    fillOpacity={i === j ? 0.35 : 1}
                    stroke={rowActive || j === selIdx ? "#52525b" : "transparent"}
                    className={onSelect ? "cursor-pointer" : undefined}
                    onClick={() => onSelect?.(row.uid)}
                  >
                    <title>
                      {row.label} ↔ {col.label}: r = {val.toFixed(2)}
                    </title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
