"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  type Cluster,
  type Pod,
  type PodPhase,
  PHASE_META,
  formatCpu,
  formatMem,
  namespacesOf,
  podCpuMilli,
  podMemMi,
} from "../lib/k8s";
import { BASE_NOW } from "../lib/mock-cluster";
import { formatMs } from "../lib/telemetry";
import NodeCard from "./NodeCard";
import PodDetail from "./PodDetail";
import StatCard from "./StatCard";

const PHASE_ORDER: PodPhase[] = ["Running", "Pending", "Succeeded", "Failed", "Unknown"];

interface ClusterDashboardProps {
  cluster: Cluster;
  /** Phase-1 telemetry KPIs (optional; from page-level data sources) */
  p99?: number;
  dropTotal?: number;
  topInterferer?: { pod: string; score: number };
  gpuIdlePct?: number;
  /** pod uids to flag on the honeycomb (e.g. packet-drop offenders) */
  alertUids?: string[];
}

export default function ClusterDashboard({
  cluster,
  p99,
  dropTotal,
  topInterferer,
  gpuIdlePct,
  alertUids,
}: ClusterDashboardProps) {
  const now = BASE_NOW; // fixed reference time keeps SSR === CSR
  const [namespace, setNamespace] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Pod | null>(null);

  const namespaces = useMemo(() => namespacesOf(cluster), [cluster]);
  const alertSet = useMemo(() => new Set(alertUids ?? []), [alertUids]);

  // cluster-wide aggregates
  const summary = useMemo(() => {
    const cpuCap = cluster.nodes.reduce((s, n) => s + n.cpuCapacityMilli, 0);
    const memCap = cluster.nodes.reduce((s, n) => s + n.memCapacityMi, 0);
    const cpuUsed = cluster.pods.reduce((s, p) => s + podCpuMilli(p), 0);
    const memUsed = cluster.pods.reduce((s, p) => s + podMemMi(p), 0);
    const phaseCounts: Record<PodPhase, number> = {
      Running: 0,
      Pending: 0,
      Succeeded: 0,
      Failed: 0,
      Unknown: 0,
    };
    for (const p of cluster.pods) phaseCounts[p.phase]++;
    const nodesReady = cluster.nodes.filter((n) => n.status === "Ready").length;
    return {
      cpuCap,
      memCap,
      cpuUsed,
      memUsed,
      cpuPct: (cpuUsed / cpuCap) * 100,
      memPct: (memUsed / memCap) * 100,
      phaseCounts,
      nodesReady,
    };
  }, [cluster]);

  // pods passing the active filters → used to dim everything else
  const visibleUids = useMemo(() => {
    const filtering = namespace !== "all" || query.trim() !== "";
    if (!filtering) return new Set<string>();
    const q = query.trim().toLowerCase();
    const set = new Set<string>();
    for (const p of cluster.pods) {
      if (namespace !== "all" && p.namespace !== namespace) continue;
      if (q && !p.name.toLowerCase().includes(q)) continue;
      set.add(p.uid);
    }
    return set;
  }, [cluster, namespace, query]);

  const matchCount = visibleUids.size;
  const filtering = namespace !== "all" || query.trim() !== "";

  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* header */}
        <header className="mb-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Kubernetes Cluster
              </div>
              <h1 className="mt-1 text-2xl font-semibold text-zinc-50 sm:text-3xl">
                {cluster.name}
              </h1>
            </div>
            <div className="text-right text-sm text-zinc-500">
              <div>
                API server <span className="font-mono text-zinc-300">{cluster.version}</span>
              </div>
              <div>
                {cluster.nodes.length} nodes · {cluster.pods.length} pods · {namespaces.length} namespaces
              </div>
            </div>
          </div>

          {/* summary stats */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="Nodes"
              value={`${summary.nodesReady}/${cluster.nodes.length}`}
              sub="Ready"
              accent={summary.nodesReady === cluster.nodes.length ? "emerald" : "amber"}
            />
            <StatCard
              label="Running"
              value={summary.phaseCounts.Running}
              sub="pods"
              accent="emerald"
            />
            <StatCard
              label="Pending"
              value={summary.phaseCounts.Pending}
              sub="pods"
              accent={summary.phaseCounts.Pending > 0 ? "amber" : "default"}
            />
            <StatCard
              label="Failed"
              value={summary.phaseCounts.Failed}
              sub="pods"
              accent={summary.phaseCounts.Failed > 0 ? "rose" : "default"}
            />
            <StatCard
              label="CPU"
              value={`${summary.cpuPct.toFixed(0)}%`}
              sub={`${formatCpu(summary.cpuUsed)} / ${formatCpu(summary.cpuCap)} cores`}
              accent="sky"
            />
            <StatCard
              label="Memory"
              value={`${summary.memPct.toFixed(0)}%`}
              sub={`${formatMem(summary.memUsed)} / ${formatMem(summary.memCap)}`}
              accent="sky"
            />
          </div>

          {/* Phase-1 eBPF telemetry strip */}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Phase1Kpi
              href="/latency"
              label="p99 지연"
              value={p99 != null ? formatMs(p99) : "—"}
              hint="네트워크 지연 분석 →"
              accent="text-rose-300"
            />
            <Phase1Kpi
              href="/drops"
              label="패킷 Drop"
              value={dropTotal != null ? dropTotal.toLocaleString() : "—"}
              hint={`${alertSet.size} pods 영향 →`}
              accent="text-amber-300"
            />
            <Phase1Kpi
              href="/interference"
              label="Top Interferer"
              value={topInterferer ? topInterferer.pod : "—"}
              hint={topInterferer ? `score ${topInterferer.score.toFixed(0)} →` : "간섭 Top-N →"}
              accent="text-violet-300"
            />
            <Phase1Kpi
              href="/gpu"
              label="GPU Idle"
              value={gpuIdlePct != null ? `${gpuIdlePct.toFixed(0)}%` : "—"}
              hint="GPU 통합 간섭 →"
              accent="text-amber-300"
            />
          </div>
        </header>

        {/* controls */}
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPill active={namespace === "all"} onClick={() => setNamespace("all")}>
              all namespaces
            </FilterPill>
            {namespaces.map((ns) => (
              <FilterPill key={ns} active={namespace === ns} onClick={() => setNamespace(ns)}>
                {ns}
              </FilterPill>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {/* legend */}
            <div className="hidden items-center gap-3 text-xs text-zinc-500 sm:flex">
              {PHASE_ORDER.map((ph) => (
                <span key={ph} className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${PHASE_META[ph].dot}`} />
                  {ph}
                </span>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pods…"
              className="w-44 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
          </div>
        </div>

        {filtering && (
          <div className="mb-3 text-xs text-zinc-500">
            {matchCount} pod{matchCount === 1 ? "" : "s"} match
            {namespace !== "all" ? ` in ${namespace}` : ""}
            {query.trim() ? ` · "${query.trim()}"` : ""}
          </div>
        )}

        {/* node grid */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {cluster.nodes.map((node) => (
            <NodeCard
              key={node.name}
              cluster={cluster}
              node={node}
              now={now}
              visibleUids={visibleUids}
              selectedUid={selected?.uid ?? null}
              onSelectPod={setSelected}
              alertUids={alertSet}
            />
          ))}
        </div>
      </div>

      <PodDetail pod={selected} now={now} onClose={() => setSelected(null)} />
    </div>
  );
}

function Phase1Kpi({
  href,
  label,
  value,
  hint,
  accent,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 transition hover:border-zinc-600 hover:bg-zinc-900/80"
    >
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${accent}`}>{value}</div>
      <div className="text-[11px] text-zinc-600 group-hover:text-zinc-400">{hint}</div>
    </Link>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? "bg-zinc-100 text-zinc-900"
          : "border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
