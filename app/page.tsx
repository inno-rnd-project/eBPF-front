"use client";

// ───────────────────────────────────────────────────────────────────────────
// 클러스터 Anomaly Map — 탐지 화면 (프로덕션 콘솔 관례 차용)
//   · Grafana Fleet overview: 상단 KPI 스트립 — 한 장의 스냅샷으로 고우선 이슈 파악
//   · Datadog Host Map: 검색 필터(불일치 디밍) + 셀 hover 미리보기, 클릭 → 드릴다운
//   · 파드 상세 = /clusters/[node]/[pod] · 노드 상세 = /clusters/[node]
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useMemo, useState } from "react";

import { useNodesQuery, usePodsQuery } from "./lib/api/queries";
import {
  C_CALM,
  C_CRIT,
  C_NODATA,
  C_WARN,
  clusterHealth,
  clusterIssues,
  DISPLAY_STATUS_TONE,
  FILL_LABEL,
  FILL_ORDER,
  type FillKey,
  HEX_CLIP,
  nodeDisplayStatus,
  nodeGpu,
  NODES,
  ORDERED,
  type Pod,
  RAMP_CSS,
} from "./lib/cluster";
import { PodHoneycomb } from "./lib/honeycomb";
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
  const [fill, setFill] = useState<FillKey>("anomaly");
  const [query, setQuery] = useState("");
  const nodesQuery = useNodesQuery();
  const podsQuery = usePodsQuery();

  const pods = useMemo(() => NODES.flatMap((n) => n.pods), []);
  const issues = useMemo(() => clusterIssues(), []);
  const health = useMemo(() => clusterHealth(), []);
  const statusCounts = useMemo(() => {
    const counts = { ok: 0, warn: 0, crit: 0, down: 0 };
    for (const node of NODES) counts[nodeDisplayStatus(node)]++;
    return counts;
  }, []);
  const gpuFleet = useMemo(() => {
    const gpuNodes = NODES.filter((n) => n.gpu);
    const devices = gpuNodes.reduce((s, n) => s + (nodeGpu(n)?.views.length ?? 0), 0);
    return { nodes: gpuNodes.length, devices };
  }, []);

  const critCount = issues.filter((i) => i.anomaly.sev === "crit").length;
  const warnCount = issues.length - critCount;
  const noDataCount = pods.filter((p) => p.cpu < 0).length;

  const q = query.trim().toLowerCase();
  const podMatches = (nodeName: string, pod: Pod) =>
    !q || pod.name.toLowerCase().includes(q) || nodeName.toLowerCase().includes(q);
  const matchCount = q
    ? NODES.reduce((s, n) => s + n.pods.filter((p) => podMatches(n.name, p)).length, 0)
    : pods.length;
  const apiPods = podsQuery.data?.pods ?? [];
  const apiError = nodesQuery.error ?? podsQuery.error;
  const apiGeneratedAt = formatGeneratedAt(nodesQuery.data?.generated_at ?? podsQuery.data?.generated_at);
  const apiStatus =
    nodesQuery.isLoading || podsQuery.isLoading
      ? "API 연결 중"
      : apiError
        ? "API 오류"
        : `${nodesQuery.data?.nodes.length ?? 0} nodes / ${apiPods.length} pods`;

  const weakest = {
    label: { cpu: "CPU", network: "Network", memory: "Memory", gpu: "GPU" }[health.dominant] ?? health.dominant,
    value:
      health.dominant === "cpu"
        ? health.cpu
        : health.dominant === "network"
          ? health.net
          : health.dominant === "memory"
            ? health.mem
            : (health.gpu ?? 1),
  };
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
              placeholder="파드 / 노드 필터"
              className="w-40 bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
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

          <span className="flex items-center gap-2 text-[12px]">
            <span className="flex items-center gap-1 font-medium text-rose-600">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> {critCount} critical
            </span>
            <span className="flex items-center gap-1 font-medium text-amber-600">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> {warnCount} warning
            </span>
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-1.5 text-[12px] text-slate-500">
              <span>Fill</span>
              <select
                value={fill}
                onChange={(e) => setFill(e.target.value as FillKey)}
                className="cursor-pointer rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-medium text-slate-700 outline-none transition-colors hover:border-slate-400 focus:border-sky-400"
              >
                {FILL_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {FILL_LABEL[k]}
                    {k === "anomaly" ? " (이상탐지)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* 캔버스 */}
        <div className="relative flex-1 overflow-auto bg-white p-6">
          {/* Fleet KPI 스트립 — 클러스터 스냅샷 한 줄 */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            <Kpi
              label="Nodes"
              value={NODES.length}
              sub={(["ok", "warn", "crit", "down"] as const)
                .filter((k) => statusCounts[k] > 0)
                .map((k) => (
                  <span key={k} className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DISPLAY_STATUS_TONE[k].dot }} />
                    {statusCounts[k]} {DISPLAY_STATUS_TONE[k].label}
                  </span>
                ))}
            />
            <Kpi
              label="Pods"
              value={pods.length}
              sub={`${pods.length - noDataCount} live · ${noDataCount} no-data`}
            />
            <Kpi
              label="Active issues"
              value={issues.length}
              valueClass={critCount ? "text-rose-600" : warnCount ? "text-amber-600" : "text-emerald-600"}
              sub={
                <>
                  <span className="text-rose-600">{critCount} critical</span>
                  <span className="text-amber-600">{warnCount} warning</span>
                </>
              }
            />
            <Kpi label="GPU fleet" value={gpuFleet.nodes} sub={`GPU 노드 · 디바이스 ${gpuFleet.devices}`} />
            <Kpi
              label="Weakest signal"
              value={weakest.label}
              valueClass={healthClass(weakest.value)}
              sub={`cluster health ${Math.round(weakest.value * 100)}%`}
            />
          </div>

          {/* 허니콤 맵 (주인공) */}
          <div className="mt-6">
            <div className="flex flex-wrap content-start items-start gap-x-10 gap-y-7">
              {ORDERED.map((node) => {
                const nodeVisible = !q || node.pods.some((p) => podMatches(node.name, p));
                return (
                  <div
                    key={node.name}
                    className={`flex flex-col gap-1.5 transition-opacity duration-200 ${nodeVisible ? "" : "opacity-25"}`}
                  >
                    {/* 노드 이름 → 노드 페이지 */}
                    <Link href={`/clusters/${node.name}`} className="group flex w-fit items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DISPLAY_STATUS_TONE[nodeDisplayStatus(node)].dot }} />
                      <span className="text-[13px] font-semibold text-slate-700 group-hover:text-sky-600 group-hover:underline">
                        {node.name}
                      </span>
                      {node.gpu ? (
                        <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold text-violet-700">GPU</span>
                      ) : null}
                      <span className="text-[12px] text-slate-400">{node.pods.length} pods</span>
                    </Link>

                    {/* 파드 허니콤 — 클릭 시 파드 상세 페이지로 이동 */}
                    <PodHoneycomb
                      node={node}
                      fill={fill}
                      matcher={q ? (pod) => podMatches(node.name, pod) : undefined}
                    />
                  </div>
                );
              })}
            </div>

            {/* 범례 */}
            <div className="pointer-events-none sticky bottom-0 mt-6 flex justify-end">
              <div className="pointer-events-auto flex items-center gap-3 rounded border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm backdrop-blur">
                {fill === "anomaly" ? (
                  <>
                    <LegendHex color={C_CALM} label="정상" />
                    <LegendHex color={C_WARN} label="경고" />
                    <LegendHex color={C_CRIT} label="위험" />
                    <LegendHex color={C_NODATA} label="데이터 없음" />
                  </>
                ) : (
                  <>
                    <span className="font-medium text-slate-600">{FILL_LABEL[fill]} Utilization</span>
                    <span>0%</span>
                    <div className="h-2 w-36 rounded-sm" style={{ background: RAMP_CSS }} />
                    <span>100%</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
