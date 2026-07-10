"use client";

// ───────────────────────────────────────────────────────────────────────────
// 파드 허니콤 — 맵(/)과 노드 페이지가 공유하는 동일 육각형 클러스터
// ───────────────────────────────────────────────────────────────────────────

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  type Anomaly,
  C_CALM,
  C_CRIT,
  C_NODATA,
  C_WARN,
  clamp,
  type ClusterNode,
  type FillKey,
  METRIC_GET,
  type Pod,
  podAnomaly,
  rampColor,
  SEV_TONE,
} from "./cluster";

const HEX_S = 22;
const HEX_R = 19.8;

function hexPath(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i);
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

function honeycomb(count: number) {
  const cols = clamp(Math.round(Math.sqrt(count * 2.2)), 2, 16);
  const colW = 1.5 * HEX_S;
  const rowH = Math.sqrt(3) * HEX_S;
  const cells = Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { cx: HEX_S + col * colW, cy: rowH / 2 + row * rowH + (col % 2 ? rowH / 2 : 0) };
  });
  const usedCols = Math.min(count, cols);
  const rows = Math.ceil(count / cols);
  const width = 2 * HEX_S + (usedCols - 1) * colW;
  const height = rowH * (rows + (usedCols > 1 ? 0.5 : 0));
  return { cells, width, height };
}

type HoverState = { pod: Pod; anomaly: Anomaly | null; x: number; y: number };

export function PodHoneycomb({
  node,
  fill = "anomaly",
  onSelectPod,
  selectedPod,
  matcher,
}: {
  node: ClusterNode;
  fill?: FillKey;
  onSelectPod?: (pod: Pod) => void; // 지정 시 클릭이 페이지 이동 대신 선택 콜백 (맵의 사이드 패널)
  selectedPod?: string | null; // 선택된 파드 — 인디고 링으로 강조
  matcher?: (pod: Pod) => boolean; // 검색 필터 — 불일치 파드는 디밍
}) {
  const router = useRouter();
  const comb = honeycomb(node.pods.length);
  const [hover, setHover] = useState<HoverState | null>(null);

  function fillOf(pod: Pod) {
    if (fill !== "anomaly") return rampColor(METRIC_GET[fill](pod));
    const a = podAnomaly(node, pod);
    if (a) return a.sev === "crit" ? C_CRIT : C_WARN;
    return pod.cpu < 0 ? C_NODATA : C_CALM;
  }

  return (
    <>
      <svg
        viewBox={`0 0 ${comb.width} ${comb.height}`}
        width={comb.width}
        height={comb.height}
        role="img"
        aria-label={`${node.name} 파드 ${node.pods.length}개`}
        className="block"
        onMouseLeave={() => setHover(null)}
      >
        {node.pods.map((pod, i) => {
          const cell = comb.cells[i];
          const a = fill === "anomaly" ? podAnomaly(node, pod) : null;
          const dimmed = matcher ? !matcher(pod) : false;
          const selected = selectedPod === pod.name;
          return (
            <polygon
              key={pod.name}
              points={hexPath(cell.cx, cell.cy, HEX_R)}
              fill={fillOf(pod)}
              stroke={selected ? "#4f46e5" : a ? SEV_TONE[a.sev].stroke : "#ffffff"}
              strokeWidth={selected ? 2.6 : a ? 1.6 : 1.2}
              opacity={dimmed ? 0.15 : 1}
              className={`cursor-pointer transition-[fill,opacity] duration-200 hover:opacity-70 ${
                a?.sev === "crit" && !dimmed ? "animate-pulse" : ""
              }`}
              aria-label={pod.name}
              onMouseEnter={(e) =>
                setHover({ pod, anomaly: podAnomaly(node, pod), x: e.clientX, y: e.clientY })
              }
              onMouseMove={(e) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))}
              onClick={() =>
                onSelectPod ? onSelectPod(pod) : router.push(`/clusters/${node.name}/${pod.name}`)
              }
            />
          );
        })}
      </svg>
      {hover ? <PodTooltip {...hover} /> : null}
    </>
  );
}

// ── hover 카드 — 커서를 따라다니는 간략 정보 ──────────────────────────────────
function PodTooltip({ pod, anomaly, x, y }: HoverState) {
  const noData = pod.cpu < 0;
  const namespace = pod.name.replace(/-\d+$/, "");
  const sev = noData
    ? { dot: "#94a3b8", label: "데이터 없음" }
    : anomaly?.sev === "crit"
      ? { dot: C_CRIT, label: "위험" }
      : anomaly?.sev === "warn"
        ? { dot: C_WARN, label: "경고" }
        : { dot: "#10b981", label: "정상" };

  // 화면 우/하단에서 잘리지 않게 — 가까우면 커서 반대편으로 뒤집어 배치
  const W = 224; // w-56
  const left = typeof window !== "undefined" && x + 14 + W > window.innerWidth ? Math.max(8, x - W - 14) : x + 14;
  const top = typeof window !== "undefined" && y + 14 + 190 > window.innerHeight ? Math.max(8, y - 190) : y + 14;

  return (
    <div
      role="tooltip"
      style={{ left, top }}
      className="pointer-events-none fixed z-50 w-56 rounded-lg border border-slate-200 bg-white/95 p-3 text-slate-900 shadow-lg backdrop-blur"
    >
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: sev.dot }} />
        <span className="truncate font-mono text-[12px] font-semibold">{pod.name}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
        <span>{namespace}</span>
        <span>·</span>
        <span style={{ color: sev.dot }} className="font-medium">
          {sev.label}
        </span>
      </div>

      {noData ? (
        <p className="mt-2 text-[11px] text-slate-500">텔레메트리가 수집되지 않습니다.</p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
          {(
            [
              ["CPU", pod.cpu],
              ["MEM", pod.mem],
              ["NET", pod.net],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="rounded bg-slate-50 px-1 py-1">
              <div className="text-[9px] font-medium text-slate-500">{label}</div>
              <div className="text-[12px] font-semibold tabular-nums">{v}%</div>
            </div>
          ))}
        </div>
      )}

      {anomaly ? (
        <div
          className="mt-2 rounded px-2 py-1.5 text-[11px] font-medium"
          style={{ backgroundColor: SEV_TONE[anomaly.sev].bg, color: SEV_TONE[anomaly.sev].text }}
        >
          ⚠ {anomaly.headline}
        </div>
      ) : null}

      {!noData ? (
        <p className="mt-2 text-[10px] text-slate-500">클릭해서 자세히 보기 →</p>
      ) : null}
    </div>
  );
}
