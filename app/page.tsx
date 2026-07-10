"use client";

// ───────────────────────────────────────────────────────────────────────────
// 클러스터 Anomaly Map — 탐지 화면 (프로덕션 콘솔 관례 차용)
//   · Grafana Fleet overview: 상단 KPI 스트립 — 한 장의 스냅샷으로 고우선 이슈 파악
//   · Datadog Watchdog: 우측 Active Issues 트리아지 레일 — 심각도순 "무엇이 왜"
//   · Datadog Host Map: 검색 필터(불일치 디밍) + 셀 클릭 → 사이드 상세 패널
//     (컨텍스트를 잃지 않고 미리보기 → 필요할 때만 드릴다운 이동)
//   · 파드 상세 = /clusters/[node]/[pod] · 노드 상세 = /clusters/[node]
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useNodesQuery, usePodsQuery } from "./lib/api/queries";
import {
  C_CALM,
  C_CRIT,
  C_NODATA,
  C_WARN,
  type ClusterIssue,
  clusterHealth,
  clusterIssues,
  DISPLAY_STATUS_TONE,
  FILL_LABEL,
  FILL_ORDER,
  type FillKey,
  getNode,
  HEX_CLIP,
  KIND_LABEL,
  nodeDisplayStatus,
  nodeDownAnomaly,
  nodeGpu,
  NODES,
  nodeStats,
  ORDERED,
  type Pod,
  podAnomaly,
  RAMP_CSS,
  SEV_TONE,
} from "./lib/cluster";
import { PodHoneycomb } from "./lib/honeycomb";
import { LegendHex, MetricBar } from "./lib/ui";

type Selection = { node: string; pod: string | null };

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

function formatMemory(bytes: number) {
  const gib = bytes / 1024 ** 3;
  return `${gib >= 10 ? gib.toFixed(0) : gib.toFixed(1)} GiB`;
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

// ── Active Issues 트리아지 레일 (Datadog Watchdog 관례) ──────────────────────
function IssuesRail({
  issues,
  total,
  onPick,
}: {
  issues: ClusterIssue[];
  total: number;
  onPick: (sel: Selection) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Active Issues</span>
        <span className="text-[11px] font-medium text-slate-400">
          {issues.length === total ? total : `${issues.length} / ${total}`}
        </span>
      </div>
      {issues.length ? (
        <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-auto">
          {issues.map((issue) => {
            const entity = issue.pod?.name ?? issue.node.name;
            const tone = SEV_TONE[issue.anomaly.sev];
            return (
              <li key={`${issue.node.name}/${entity}`}>
                <button
                  type="button"
                  onClick={() => onPick({ node: issue.node.name, pod: issue.pod?.name ?? null })}
                  className="w-full px-3 py-2 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tone.fill }} />
                    <span className="truncate font-mono text-[12px] font-semibold text-slate-800">{entity}</span>
                    <span className="ml-auto shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold text-slate-500">
                      {KIND_LABEL[issue.anomaly.kind]}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-600">{issue.anomaly.headline}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {issue.pod ? issue.node.name : "노드 레벨 이슈"}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="px-3 py-6 text-center text-[12px] text-slate-400">활성 이슈가 없습니다</div>
      )}
    </div>
  );
}

// ── 선택 상세 패널 (Datadog Host Map: 클릭 → 사이드 패널 미리보기) ───────────
function SelectionPanel({ sel, onClose }: { sel: Selection; onClose: () => void }) {
  const node = getNode(sel.node);
  if (!node) return null;
  const pod = sel.pod ? (node.pods.find((p) => p.name === sel.pod) ?? null) : null;

  const anomaly = pod
    ? podAnomaly(node, pod)
    : node.status === "down"
      ? nodeDownAnomaly(node)
      : null;
  const noData = pod ? pod.cpu < 0 : false;
  const stats = pod ? null : nodeStats(node);
  const status = noData
    ? { dot: "#94a3b8", label: "데이터 없음" }
    : anomaly
      ? { dot: SEV_TONE[anomaly.sev].fill, label: SEV_TONE[anomaly.sev].label }
      : { dot: "#10b981", label: "정상" };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-2 border-b border-slate-100 px-3 py-2.5">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: status.dot }} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[13px] font-semibold text-slate-800">
            {pod ? pod.name : node.name}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            {pod ? (
              <>
                <span>{pod.name.replace(/-\d+$/, "")}</span>
                <span>·</span>
                <Link href={`/clusters/${node.name}`} className="hover:text-sky-600 hover:underline">
                  {node.name}
                </Link>
              </>
            ) : (
              <span>{node.role === "control-plane" ? "Control-plane 노드" : "Worker 노드"}</span>
            )}
            <span>·</span>
            <span style={{ color: status.dot }} className="font-medium">
              {status.label}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="패널 닫기"
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="space-y-3 px-3 py-3">
        {noData ? (
          <p className="text-[12px] text-slate-500">
            텔레메트리가 수집되지 않습니다.
            {node.status === "down" ? " 노드가 NotReady 상태입니다." : ""}
          </p>
        ) : pod ? (
          <div className="space-y-2">
            <MetricBar label="CPU" value={pod.cpu} />
            <MetricBar label="Memory" value={pod.mem} />
            <MetricBar label="Network" value={pod.net} />
          </div>
        ) : stats ? (
          <div className="space-y-2">
            <MetricBar label="CPU (파드 평균)" value={stats.cpu} />
            <MetricBar label="Memory (파드 평균)" value={stats.mem} />
            <MetricBar label="Network (파드 평균)" value={stats.net} />
            <div className="text-[11px] text-slate-500">
              {node.status === "down"
                ? `파드 ${node.pods.length} · 전체 텔레메트리 수집 중단`
                : `파드 ${node.pods.length} · 이슈 ${stats.crit + stats.warn} · no-data ${stats.noData}`}
            </div>
          </div>
        ) : null}

        {anomaly ? (
          <div className="space-y-2">
            <div
              className="rounded px-2 py-1.5 text-[12px] font-semibold"
              style={{ backgroundColor: SEV_TONE[anomaly.sev].bg, color: SEV_TONE[anomaly.sev].text }}
            >
              {anomaly.headline}
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {anomaly.source === "control-plane" ? "Control-plane 신호" : "eBPF 신호"}
              </div>
              <ul className="mt-1 space-y-1">
                {anomaly.ebpf.map((sig) => (
                  <li key={sig} className="flex gap-1.5 text-[11px] leading-snug text-slate-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                    <span>{sig}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
              <span className="font-semibold text-slate-700">권장 조치</span> — {anomaly.action}
            </div>
          </div>
        ) : null}

        <div className="flex gap-2 pt-1">
          {pod && !noData ? (
            <Link
              href={`/clusters/${node.name}/${pod.name}`}
              className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-center text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              파드 상세 분석 →
            </Link>
          ) : null}
          <Link
            href={`/clusters/${node.name}`}
            className={`rounded-lg px-3 py-1.5 text-center text-[12px] font-semibold transition-colors ${
              pod && !noData
                ? "border border-slate-200 text-slate-600 hover:bg-slate-50"
                : "flex-1 bg-indigo-600 text-white hover:bg-indigo-500"
            }`}
          >
            노드 상세 분석 →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [fill, setFill] = useState<FillKey>("anomaly");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [invOpen, setInvOpen] = useState(false);
  const nodesQuery = useNodesQuery();
  const podsQuery = usePodsQuery();

  // Escape 로 선택 해제 (사이드 패널 닫기)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
  const visibleIssues = q
    ? issues.filter((i) => (i.pod ? podMatches(i.node.name, i.pod) : i.node.name.toLowerCase().includes(q)))
    : issues;

  const apiPods = podsQuery.data?.pods ?? [];
  const apiPodsByNode = apiPods.reduce<Record<string, number>>((acc, pod) => {
    acc[pod.node] = (acc[pod.node] ?? 0) + 1;
    return acc;
  }, {});
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

          <div className="mt-6 flex flex-col gap-6 xl:flex-row">
            {/* 허니콤 맵 (주인공) */}
            <div className="min-w-0 flex-1">
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

                      {/* 파드 허니콤 — 클릭 시 사이드 패널 선택 */}
                      <PodHoneycomb
                        node={node}
                        fill={fill}
                        matcher={q ? (pod) => podMatches(node.name, pod) : undefined}
                        selectedPod={selected?.node === node.name ? selected.pod : null}
                        onSelectPod={(pod) => setSelected({ node: node.name, pod: pod.name })}
                      />
                    </div>
                  );
                })}
              </div>

              {/* 라이브 인벤토리 (실 API) — 접이식, 맵을 밀어내지 않게 */}
              <section className="mt-8 rounded-xl border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setInvOpen((v) => !v)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className={`h-3 w-3 text-slate-400 transition-transform ${invOpen ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  라이브 인벤토리
                  <span className="font-normal text-slate-400">
                    {nodesQuery.isLoading || podsQuery.isLoading
                      ? "API 연결 중"
                      : `API · ${nodesQuery.data?.nodes.length ?? 0} nodes / ${apiPods.length} pods`}
                  </span>
                  {apiError ? (
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">오류</span>
                  ) : null}
                </button>
                {invOpen ? (
                  <div className="border-t border-slate-100 px-4 py-3">
                    {apiError ? (
                      <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">
                        API 요청 실패: {apiError instanceof Error ? apiError.message : "알 수 없는 오류"}
                      </div>
                    ) : null}
                    {nodesQuery.data?.nodes.length ? (
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {nodesQuery.data.nodes.map((node) => (
                          <div key={node.uid} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${node.ready ? "bg-emerald-500" : "bg-rose-500"}`} />
                              <span className="truncate text-[13px] font-semibold text-slate-800">{node.name}</span>
                              {node.capacity.gpu ? (
                                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">
                                  GPU {node.capacity.gpu}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 truncate text-[11px] text-slate-500">{node.internal_ip}</div>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-slate-600">
                              <span>{node.capacity.cpu} CPU</span>
                              <span>{formatMemory(node.capacity.memory_bytes)}</span>
                              <span>{apiPodsByNode[node.name] ?? 0} pods</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : !apiError ? (
                      <div className="text-[12px] text-slate-400">
                        {nodesQuery.isLoading ? "API 인벤토리를 불러오는 중입니다." : "표시할 인벤토리가 없습니다."}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

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

            {/* 우측 레일 — 기본 Active Issues, 선택 시 상세 패널 */}
            <aside className="w-full shrink-0 xl:w-80">
              <div className="xl:sticky xl:top-4">
                {selected ? (
                  <SelectionPanel sel={selected} onClose={() => setSelected(null)} />
                ) : (
                  <IssuesRail issues={visibleIssues} total={issues.length} onPick={setSelected} />
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
