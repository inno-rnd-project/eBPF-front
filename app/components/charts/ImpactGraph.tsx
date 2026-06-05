"use client";

import { heatColor } from "./chartUtils";

export interface ImpactNode {
  uid: string;
  label: string;
  score: number;
  weight: number; // edge weight from center (0–1)
}

interface ImpactGraphProps {
  center: { uid: string; label: string; score: number };
  targets: ImpactNode[];
  onSelect?: (uid: string) => void;
}

const W = 480;
const H = 380;
const CX = W / 2;
const CY = H / 2;
const RING = 132;

export default function ImpactGraph({ center, targets, onSelect }: ImpactGraphProps) {
  const items = [...targets].sort((a, b) => b.weight - a.weight).slice(0, 8);

  if (items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-center text-xs text-zinc-600">
        이 Pod가 유의미하게 영향을 주는 대상이 없습니다
        <br />
        (상관계수 r &gt; 0.45 기준)
      </div>
    );
  }

  const centerR = 26;
  const placed = items.map((t, i) => {
    const ang = (-90 + (i * 360) / items.length) * (Math.PI / 180);
    return { ...t, x: CX + RING * Math.cos(ang), y: CY + RING * Math.sin(ang), r: 10 + (t.score / 100) * 10 };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#71717a" />
        </marker>
      </defs>

      {/* edges */}
      {placed.map((t) => {
        const dx = t.x - CX;
        const dy = t.y - CY;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const x1 = CX + ux * centerR;
        const y1 = CY + uy * centerR;
        const x2 = t.x - ux * (t.r + 7);
        const y2 = t.y - uy * (t.r + 7);
        return (
          <g key={`e${t.uid}`}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#71717a"
              strokeWidth={1 + t.weight * 4}
              strokeOpacity={0.3 + t.weight * 0.6}
              markerEnd="url(#arrow)"
            />
            <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 3} textAnchor="middle" fontSize={9} fill="#a1a1aa">
              {t.weight.toFixed(2)}
            </text>
          </g>
        );
      })}

      {/* target nodes */}
      {placed.map((t) => (
        <g key={t.uid} className={onSelect ? "cursor-pointer" : undefined} onClick={() => onSelect?.(t.uid)}>
          <circle cx={t.x} cy={t.y} r={t.r} fill={heatColor(t.score / 100)} fillOpacity={0.9} stroke="#18181b" strokeWidth={1.5} />
          <text x={t.x} y={t.y + t.r + 11} textAnchor="middle" fontSize={9.5} fill="#d4d4d8">
            {t.label.length > 18 ? t.label.slice(0, 17) + "…" : t.label}
          </text>
          <title>
            {t.label} · score {t.score.toFixed(0)} · r {t.weight.toFixed(2)}
          </title>
        </g>
      ))}

      {/* center node */}
      <circle cx={CX} cy={CY} r={centerR} fill={heatColor(center.score / 100)} stroke="#fafafa" strokeWidth={2} />
      <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="#0a0a0a">
        {center.score.toFixed(0)}
      </text>
      <text x={CX} y={CY + centerR + 13} textAnchor="middle" fontSize={10} fontWeight={600} fill="#fafafa">
        {center.label.length > 22 ? center.label.slice(0, 21) + "…" : center.label}
      </text>
    </svg>
  );
}
