"use client";

// ───────────────────────────────────────────────────────────────────────────
// 클러스터 Anomaly Map — 탐지 화면 (프로덕션 콘솔 관례 차용)
//   · Grafana Fleet overview: 상단 KPI 스트립 — 한 장의 스냅샷으로 고우선 이슈 파악
//   · Datadog Host Map: 검색 필터(불일치 디밍) + 셀 hover 미리보기, 클릭 → 드릴다운
//   · 데이터: GET /overview(KPI 스트립) + GET /node-map(허니콤) — 30s 자동 갱신
//   · 파드 상세 = /clusters/[node]/[pod] · 노드 상세 = /clusters/[node]
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useMemo, useState } from "react";

import { useNodeMapQuery, useOverviewQuery } from "./lib/api/queries";
import type { NodeMapPod } from "./lib/api/types";
import {
  C_CALM,
  C_CRIT,
  C_NODATA,
  C_WARN,
  DISPLAY_STATUS_TONE,
  HEX_CLIP,
  type NodeDisplayStatus,
} from "./lib/cluster";
import { NodeMapHoneycomb } from "./lib/honeycomb";
import { LegendHex } from "./lib/ui";

function NavIcon({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
        active ? "bg-white/10 text-white" : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
      }`}
    >
      {children}
    </span>
  );
}

function Seg({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
      <span>{label}</span>
      <span className="flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-medium text-slate-700">
        {value}
      </span>
    </span>
  );
}

function formatGeneratedAt(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date);
}

// 백엔드 노드 status 문자열 → 표시 상태 토큰
function nodeDisplayStatusOf(status: string): NodeDisplayStatus {
  const s = status.toLowerCase();
  if (s === "down" || s === "notready" || s === "not_ready") return "down";
  if (s === "critical" || s === "crit") return "crit";
  if (s === "warning" || s === "warn" || s === "degraded") return "warn";
  return "ok";
}

const DIMENSION_LABEL: Record<string, string> = {
  cpu: "CPU",
  network: "Network",
  memory: "Memory",
  gpu: "GPU",
};

// ── Fleet KPI 스트립 칩 (Grafana fleet overview 관례) ────────────────────────
function Kpi({
  label,
  value,
  sub,
  valueClass = "text-slate-800",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-[17px] font-bold leading-tight tabular-nums ${valueClass}`}>{value}</div>
      {sub ? (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium text-slate-500">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const nodeMapQuery = useNodeMapQuery();
  const overviewQuery = useOverviewQuery();

  const overview = overviewQuery.data;
  const nodes = useMemo(
    () => [...(nodeMapQuery.data?.nodes ?? [])].sort((a, b) => b.pods.length - a.pods.length),
    [nodeMapQuery.data],
  );

  const q = query.trim().toLowerCase();
  const podMatches = (nodeName: string, pod: NodeMapPod) =>
    !q ||
    pod.pod.toLowerCase().includes(q) ||
    pod.namespace.toLowerCase().includes(q) ||
    nodeName.toLowerCase().includes(q);
  const podTotal = nodes.reduce((s, n) => s + n.pods.length, 0);
  const matchCount = q
    ? nodes.reduce((s, n) => s + n.pods.filter((p) => podMatches(n.name, p)).length, 0)
    : podTotal;

  const apiError = nodeMapQuery.error ?? overviewQuery.error;
  const apiGeneratedAt = formatGeneratedAt(nodeMapQuery.data?.generated_at ?? overview?.generated_at);
  const apiStatus =
    nodeMapQuery.isPending || overviewQuery.isPending
      ? "API 연결 중"
      : apiError
        ? "API 오류"
        : `${nodes.length} nodes / ${podTotal} pods`;

  const critCount = overview?.issues.critical ?? 0;
  const warnCount = overview?.issues.warning ?? 0;

  const weakest = overview
    ? {
        label: DIMENSION_LABEL[overview.weakest.dimension] ?? overview.weakest.dimension,
        health: overview.weakest.health,
        status: overview.weakest.status,
      }
    : null;
  const healthClass = (v: number) =>
    v < 0.7 ? "text-rose-600" : v < 0.85 ? "text-amber-600" : "text-emerald-600";

  return (
    <main className="flex min-h-screen bg-white text-slate-900">
      {/* 좌측 다크 네비 */}
      <aside className="hidden w-12 shrink-0 flex-col items-center gap-1 bg-[#15151f] py-3 sm:flex">
        <span
          aria-hidden
          className={`mb-3 flex h-8 w-8 items-center justify-center bg-linear-to-br from-indigo-500 to-sky-500 text-white ${HEX_CLIP}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
            <path d="M12 2.5l8.5 4.9v9.2L12 21.5 3.5 16.6V7.4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2.4" fill="currentColor" />
          </svg>
        </span>
        <NavIcon active>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M7 3h6l3 5-3 5H7L4 8zm9 8h2l3 5-3 5h-6l-1.5-2.5L13 16z" />
          </svg>
        </NavIcon>
        <NavIcon>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="4" width="18" height="6" rx="1.5" />
            <rect x="3" y="14" width="18" height="6" rx="1.5" />
          </svg>
        </NavIcon>
        <NavIcon>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="6" cy="6" r="2.5" />
            <circle cx="18" cy="6" r="2.5" />
            <circle cx="12" cy="18" r="2.5" />
            <path d="M8 7l8 0M7 8l4 8M17 8l-4 8" />
          </svg>
        </NavIcon>
      </aside>

      {/* 본문 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 상단 탭 줄 */}
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-[12px] text-slate-500">
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor"><rect x="2" y="2" width="5" height="5" /><rect x="9" y="2" width="5" height="5" /><rect x="2" y="9" width="5" height="5" /><rect x="9" y="9" width="5" height="5" /></svg>
            Anomaly Map
          </span>
          <span>eBPF Observability</span>
          <span
            className={`ml-auto rounded px-2 py-0.5 font-medium ${
              apiError ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"
            }`}
            title={apiError instanceof Error ? apiError.message : undefined}
          >
            {apiStatus}
            {apiGeneratedAt ? ` / ${apiGeneratedAt}` : ""}
          </span>
        </div>

        {/* 상단 컨트롤 바 */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 bg-[#fafbfc] px-4 py-2">
          <Seg label="View" value="Pods" />
          <Seg label="Group" value="node" />

          {/* 검색 필터 — 불일치 파드는 맵에서 디밍 */}
          <label className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2 py-1 transition-colors focus-within:border-sky-400">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="파드 / 네임스페이스 / 노드 필터"
              className="w-44 bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="필터 지우기"
                className="text-slate-400 transition-colors hover:text-slate-600"
              >
                ×
              </button>
            ) : null}
          </label>
          {q ? <span className="text-[11px] font-medium text-slate-400">{matchCount}개 일치</span> : null}

          {overview ? (
            <span className="flex items-center gap-2 text-[12px]">
              <span className="flex items-center gap-1 font-medium text-rose-600">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> {critCount} critical
              </span>
              <span className="flex items-center gap-1 font-medium text-amber-600">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> {warnCount} warning
              </span>
            </span>
          ) : null}
        </div>

        {/* 캔버스 */}
        <div className="relative flex-1 overflow-auto bg-white p-6">
          {/* Fleet KPI 스트립 — GET /overview 스냅샷 한 줄 */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            <Kpi
              label="Nodes"
              value={overview?.nodes.total ?? "—"}
              sub={
                overview
                  ? (
                      [
                        ["ok", overview.nodes.healthy],
                        ["warn", overview.nodes.warning],
                        ["down", overview.nodes.down],
                      ] as const
                    )
                      .filter(([, count]) => count > 0)
                      .map(([k, count]) => (
                        <span key={k} className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DISPLAY_STATUS_TONE[k].dot }} />
                          {count} {DISPLAY_STATUS_TONE[k].label}
                        </span>
                      ))
                  : undefined
              }
            />
            <Kpi
              label="Pods"
              value={overview?.pods.total ?? "—"}
              sub={overview ? `${overview.pods.live} live · ${overview.pods.no_data} no-data` : undefined}
            />
            <Kpi
              label="Active issues"
              value={overview?.issues.total ?? "—"}
              valueClass={
                !overview
                  ? "text-slate-800"
                  : critCount
                    ? "text-rose-600"
                    : warnCount
                      ? "text-amber-600"
                      : "text-emerald-600"
              }
              sub={
                overview ? (
                  <>
                    <span className="text-rose-600">{critCount} critical</span>
                    <span className="text-amber-600">{warnCount} warning</span>
                  </>
                ) : undefined
              }
            />
            <Kpi
              label="GPU fleet"
              value={overview?.gpu.nodes ?? "—"}
              sub={overview ? `GPU 노드 · 디바이스 ${overview.gpu.devices}` : undefined}
            />
            <Kpi
              label="Weakest signal"
              value={weakest?.label ?? "—"}
              valueClass={weakest?.health != null ? healthClass(weakest.health) : "text-slate-800"}
              sub={
                weakest
                  ? weakest.health != null
                    ? `cluster health ${Math.round(weakest.health * 100)}%`
                    : weakest.status
                  : undefined
              }
            />
          </div>

          {/* 허니콤 맵 (주인공) — GET /node-map */}
          {nodeMapQuery.isPending ? (
            <div className="mt-16 flex flex-col items-center gap-2 text-slate-400">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />
              <span className="text-[13px]">노드 맵을 불러오는 중…</span>
            </div>
          ) : nodeMapQuery.isError && !nodeMapQuery.data ? (
            <div className="mt-16 flex flex-col items-center gap-2">
              <p className="text-[14px] font-semibold text-slate-700">노드 맵을 불러오지 못했습니다.</p>
              <p className="text-[12px] text-slate-500">
                {nodeMapQuery.error instanceof Error ? nodeMapQuery.error.message : "API 요청이 실패했습니다."}
              </p>
              <button
                type="button"
                onClick={() => {
                  nodeMapQuery.refetch();
                  overviewQuery.refetch();
                }}
                className="mt-1 rounded border border-slate-300 bg-white px-3 py-1 text-[12px] font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
              >
                다시 시도
              </button>
            </div>
          ) : nodes.length === 0 ? (
            <p className="mt-16 text-center text-[13px] text-slate-400">표시할 노드가 없습니다.</p>
          ) : (
            <div className="mt-6 pb-12">
              <div className="flex flex-wrap content-start items-start gap-x-10 gap-y-7">
                {nodes.map((node) => {
                  const nodeVisible = !q || node.pods.some((p) => podMatches(node.name, p));
                  const display = nodeDisplayStatusOf(node.status);
                  return (
                    <div
                      key={node.name}
                      className={`flex flex-col gap-1.5 transition-opacity duration-200 ${nodeVisible ? "" : "opacity-25"}`}
                    >
                      {/* 노드 이름 → 노드 페이지 */}
                      <Link href={`/clusters/${node.name}`} className="group flex w-fit items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DISPLAY_STATUS_TONE[display].dot }} />
                        <span className="text-[13px] font-semibold text-slate-700 group-hover:text-sky-600 group-hover:underline">
                          {node.name}
                        </span>
                        {node.gpu ? (
                          <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold text-violet-700">GPU</span>
                        ) : null}
                        <span className="text-[12px] text-slate-400">{node.pods.length} pods</span>
                      </Link>

                      {/* 파드 허니콤 — 클릭 시 파드 상세 페이지로 이동 */}
                      <NodeMapHoneycomb
                        node={node}
                        matcher={q ? (pod) => podMatches(node.name, pod) : undefined}
                      />
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {/* 범례 — 화면 우하단 고정 */}
          <div className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm backdrop-blur">
            <LegendHex color={C_CALM} label="정상" />
            <LegendHex color={C_WARN} label="경고" />
            <LegendHex color={C_CRIT} label="위험" />
            <LegendHex color={C_NODATA} label="데이터 없음" />
          </div>
        </div>
      </div>
    </main>
  );
}
