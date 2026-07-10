"use client";

// ───────────────────────────────────────────────────────────────────────────
// 서비스 토폴로지 (클라이언트 섬) — 노드의 "서비스 단위" 관계 그래프 (Cilium Hubble/Kiali 관례).
//   · 노드(원) = 서비스(레플리카 집계) · 크기 = 평균 트래픽 · 색 = 서비스 내 최악 상태
//   · 엣지(방향성 화살) = noisy-neighbor 집계(suspect_service→victim_service) · 색 = victim_signal
//   · self-loop = 서비스 내부(레플리카 간) 간섭 · hover → 경로 하이라이트 + 상세 · 클릭 → 대표 파드
// 방사형 링 레이아웃(결정적), SVG viewBox 정사각(왜곡 없음).
// ───────────────────────────────────────────────────────────────────────────

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  C_CRIT,
  C_WARN,
  clamp,
  NOISY_SIGNAL_LABEL,
  NOISY_SIGNALS,
  type NoisySignal,
  type ServiceTopo,
  type SvcSeverity,
} from "./cluster";

const SIG_COLOR: Record<NoisySignal, string> = {
  latency: "#8b5cf6", // violet
  network: "#0ea5e9", // sky
  memory: "#f59e0b", // amber
  cpu: "#ec4899", // pink
};
const SEV_FILL: Record<SvcSeverity, string> = {
  crit: C_CRIT,
  warn: C_WARN,
  ok: "#94a3b8", // slate-400 (정상은 차분하게)
  nodata: "#cbd5e1", // slate-300
};
const SEV_LABEL: Record<SvcSeverity, string> = { crit: "심각", warn: "경고", ok: "정상", nodata: "N/A" };

const nodeR = (pods: number, traffic: number) => 2.4 + Math.sqrt(pods) * 0.7 + (clamp(traffic, 0, 100) / 100) * 1.6;

// 서비스 내부 간섭 self-loop — 노드에서 방사 바깥으로 부푸는 작은 루프
function selfLoopPath(x: number, y: number, r: number) {
  const dx = x - 50, dy = y - 50, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d, px = -uy, py = ux; // 바깥 방향 + 수직
  const b = r + 0.4;
  const s = { x: x + ux * b + px * 1.1, y: y + uy * b + py * 1.1 };
  const e = { x: x + ux * b - px * 1.1, y: y + uy * b - py * 1.1 };
  const c1 = { x: x + ux * (b + 7) + px * 3.2, y: y + uy * (b + 7) + py * 3.2 };
  const c2 = { x: x + ux * (b + 7) - px * 3.2, y: y + uy * (b + 7) - py * 3.2 };
  return `M ${s.x} ${s.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${e.x} ${e.y}`;
}

export function ServiceTopology({ topo, node }: { topo: ServiceTopo; node: string }) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const { nodes, edges } = topo;

  const neighbors = new Set<string>();
  if (hover) for (const e of edges) { if (!e.self) { if (e.from === hover) neighbors.add(e.to); if (e.to === hover) neighbors.add(e.from); } }

  const nodeState = (svc: string): "active" | "peer" | "dim" | "normal" => {
    if (!hover) return "normal";
    if (svc === hover) return "active";
    if (neighbors.has(svc)) return "peer";
    return "dim";
  };

  // hover한 서비스 상세 (툴팁)
  const hn = hover ? nodes.find((n) => n.service === hover) ?? null : null;
  const asSuspect = hover ? edges.filter((e) => e.from === hover && !e.self) : [];
  const asVictim = hover ? edges.filter((e) => e.to === hover && !e.self) : [];
  const hasSelf = hover ? edges.some((e) => e.self && e.from === hover) : false;
  const suspectSignals = [...new Set(asSuspect.map((e) => e.signal))].map((s) => NOISY_SIGNAL_LABEL[s]).join("·");

  return (
    <div>
      {/* 요약 */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {topo.serviceCount} services · {topo.liveCount} pods
        </span>
        <span className="font-mono">간섭 링크 {topo.linkCount}</span>
        {topo.topSuspect ? (
          <span>최다 간섭원 <span className="font-mono font-semibold text-slate-700">{topo.topSuspect.service}</span> ({topo.topSuspect.count})</span>
        ) : null}
      </div>

      <div className="relative mx-auto" style={{ maxWidth: 560 }}>
        <svg viewBox="0 0 100 100" className="aspect-square w-full">
          <defs>
            {NOISY_SIGNALS.map((s) => (
              <marker key={s} id={`sarw-${s}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="2.6" markerHeight="2.6" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill={SIG_COLOR[s]} />
              </marker>
            ))}
          </defs>

          {/* 엣지 (서비스 간섭) */}
          {edges.map((e, i) => {
            const a = nodes[e.fromIdx], b = nodes[e.toIdx];
            const color = SIG_COLOR[e.signal];
            const active = !hover || e.from === hover || e.to === hover;
            const w = 0.35 + e.score * 1.0 + Math.min(e.count, 3) * 0.12;
            let d: string;
            if (e.self) {
              d = selfLoopPath(a.x, a.y, nodeR(a.pods, a.traffic));
            } else {
              const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
              const cxp = mx + (50 - mx) * 0.45, cyp = my + (50 - my) * 0.45;
              const dx = b.x - cxp, dy = b.y - cyp, len = Math.hypot(dx, dy) || 1;
              const off = nodeR(b.pods, b.traffic) + 2.4;
              const ex = b.x - (dx / len) * off, ey = b.y - (dy / len) * off;
              const dxa = a.x - cxp, dya = a.y - cyp, lena = Math.hypot(dxa, dya) || 1;
              const soff = nodeR(a.pods, a.traffic) + 0.6;
              const sx = a.x - (dxa / lena) * soff, sy = a.y - (dya / lena) * soff;
              d = `M ${sx} ${sy} Q ${cxp} ${cyp} ${ex} ${ey}`;
            }
            return (
              <g key={i} opacity={active ? 1 : 0.1}>
                <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" opacity={0.55} markerEnd={`url(#sarw-${e.signal})`} />
                {e.strong && (
                  <path className="flow-line" d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeDasharray="0.6 4" style={{ animationDuration: "1.1s" }} />
                )}
              </g>
            );
          })}

          {/* 중심 노드 라벨 (서비스 2개 이상일 때) */}
          {topo.serviceCount > 1 && (
            <>
              <text x="50" y="49" textAnchor="middle" className="fill-slate-700" style={{ fontSize: 3, fontWeight: 700 }}>{topo.node}</text>
              <text x="50" y="53" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 2.1 }}>{topo.serviceCount} svc · {topo.liveCount} pods</text>
            </>
          )}

          {/* 서비스 노드 */}
          {nodes.map((nd) => {
            const st = nodeState(nd.service);
            const r = nodeR(nd.pods, nd.traffic);
            return (
              <g
                key={nd.service}
                opacity={st === "dim" ? 0.3 : 1}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(nd.service)}
                onMouseLeave={() => setHover(null)}
                onClick={() => router.push(`/clusters/${encodeURIComponent(node)}/${encodeURIComponent(nd.repPod)}`)}
              >
                {nd.severity === "crit" && (
                  <circle cx={nd.x} cy={nd.y} r={r + 1.8} fill="none" stroke={C_CRIT} strokeWidth={0.5} className="is-crit-breathe" />
                )}
                <circle
                  cx={nd.x} cy={nd.y} r={st === "active" ? r + 0.8 : r}
                  fill={SEV_FILL[nd.severity]}
                  stroke={st === "active" || st === "peer" ? "#4338ca" : "#ffffff"}
                  strokeWidth={st === "active" || st === "peer" ? 1 : 0.8}
                />
                {/* 파드 수 (노드 안) */}
                <text x={nd.x} y={nd.y + 0.9} textAnchor="middle" className="fill-white" style={{ fontSize: 2.4, fontWeight: 700, pointerEvents: "none" }}>{nd.pods}</text>
                {/* 서비스명 (링 바깥) */}
                <text
                  x={nd.labelX} y={nd.labelY + 0.8}
                  textAnchor={nd.anchor}
                  className={nd.severity === "crit" || nd.severity === "warn" ? "fill-slate-800" : "fill-slate-600"}
                  style={{ fontSize: 2.7, fontWeight: nd.severity === "crit" || nd.severity === "warn" ? 700 : 500 }}
                >
                  {nd.service}
                </text>
              </g>
            );
          })}
        </svg>

        {/* hover 툴팁 — 서비스명 + 상태 + 간섭 역할 */}
        {hn && (
          <div
            className="pointer-events-none absolute z-30 max-w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] shadow-lg"
            style={{ left: `${hn.x}%`, top: `${hn.y}%`, transform: hn.y < 30 ? "translate(-50%, 18px)" : "translate(-50%, calc(-100% - 18px))" }}
          >
            <div className="flex items-center gap-1.5 font-mono text-[12px] font-bold text-slate-800">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEV_FILL[hn.severity] }} />
              {hn.service}
            </div>
            <div className="mt-0.5 font-mono text-slate-500">{SEV_LABEL[hn.severity]} · {hn.live}/{hn.pods} pods · net {hn.traffic}%</div>
            {asSuspect.length > 0 && (
              <div className="mt-1 text-rose-600">간섭원 → {asSuspect.map((e) => e.to).join(", ")} <span className="text-slate-400">({suspectSignals})</span></div>
            )}
            {asVictim.length > 0 && (
              <div className="mt-0.5 break-keep text-amber-600">피해자 ← {asVictim.map((e) => e.from).join(", ")}</div>
            )}
            {hasSelf && <div className="mt-0.5 text-slate-500">내부 간섭 (레플리카 간)</div>}
            {asSuspect.length === 0 && asVictim.length === 0 && !hasSelf && (
              <div className="mt-1 text-slate-400">간섭 관계 없음</div>
            )}
            <div className="mt-1 text-[10px] text-slate-400">클릭 → {hn.repPod}</div>
          </div>
        )}
      </div>

      {/* 범례 */}
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
          <span className="font-semibold text-slate-600">victim_signal</span>
          {NOISY_SIGNALS.map((s) => (
            <span key={s} className="flex items-center gap-1">
              <svg viewBox="0 0 16 4" className="h-1 w-4"><line x1="0" y1="2" x2="16" y2="2" stroke={SIG_COLOR[s]} strokeWidth="2.5" /></svg>
              {NOISY_SIGNAL_LABEL[s]}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
          <span className="font-semibold text-slate-600">서비스</span>
          {(["crit", "warn", "ok", "nodata"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEV_FILL[s] }} />
              {SEV_LABEL[s]}
            </span>
          ))}
          <span className="ml-auto font-mono text-slate-400">크기 = 파드수·트래픽 · 화살표 = suspect→victim · 클릭 → 대표 파드</span>
        </div>
      </div>
    </div>
  );
}
