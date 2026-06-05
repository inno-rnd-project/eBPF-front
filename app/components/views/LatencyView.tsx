"use client";

import { useMemo, useState } from "react";
import {
  LATENCY_STAGES,
  type LatencyData,
  formatMs,
  histogramBuckets,
  percentile,
} from "../../lib/telemetry";
import StackedArea from "../charts/StackedArea";
import Histogram from "../charts/Histogram";
import Heatmap, { type HeatRow } from "../charts/Heatmap";
import HorizontalBar from "../charts/HorizontalBar";
import Sparkline from "../charts/Sparkline";

export default function LatencyView({ latency }: { latency: LatencyData }) {
  const [namespace, setNamespace] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  const namespaces = useMemo(
    () => Array.from(new Set(latency.pods.map((p) => p.namespace))).sort(),
    [latency],
  );

  const filteredPods = useMemo(() => {
    const q = query.trim().toLowerCase();
    return latency.pods
      .filter((p) => (namespace === "all" ? true : p.namespace === namespace))
      .filter((p) => (q ? p.pod.toLowerCase().includes(q) : true))
      .sort((a, b) => b.p95 - a.p95);
  }, [latency, namespace, query]);

  const last = latency.percentiles[latency.percentiles.length - 1] ?? { p50: 0, p95: 0, p99: 0 };
  const times = latency.pods[0]?.points.map((p) => p.t) ?? [];
  const colorMax = useMemo(() => percentile(latency.histogramSamples, 0.97), [latency]);

  const histSamples = useMemo(
    () => filteredPods.flatMap((p) => p.points.map((pt) => pt.v)),
    [filteredPods],
  );
  const buckets = useMemo(() => histogramBuckets(histSamples, 24), [histSamples]);

  const heatRows: HeatRow[] = filteredPods.map((p) => ({
    uid: p.uid,
    label: p.pod,
    sub: p.node,
    values: p.points.map((pt) => pt.v),
  }));

  const selected = filteredPods.find((p) => p.uid === selectedUid) ?? null;

  const pctSeries = (key: "p50" | "p95" | "p99") => latency.percentiles.map((p) => p[key]);

  return (
    <div className="px-6 py-6">
      <header className="mb-5">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Phase 1 · 기능 1</div>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-50">네트워크 지연시간 분석</h1>
        <p className="mt-1 text-sm text-zinc-500">
          eBPF tracepoint로 측정한 커널 내부 단계별 처리시간 — “단순히 느리다”가 아니라 “어느 단계에서 몇 ms 소요”
        </p>
      </header>

      {/* KPI */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          ["p50", "#34d399", last.p50],
          ["p95", "#fbbf24", last.p95],
          ["p99", "#f43f5e", last.p99],
        ] as const).map(([key, color, val]) => (
          <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{key} 지연</span>
              <Sparkline values={pctSeries(key)} color={color} width={90} height={24} />
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color }}>
              {formatMs(val)}
            </div>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill active={namespace === "all"} onClick={() => setNamespace("all")}>
            all namespaces
          </Pill>
          {namespaces.map((ns) => (
            <Pill key={ns} active={namespace === ns} onClick={() => setNamespace(ns)}>
              {ns}
            </Pill>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pod 검색…"
          className="w-44 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* stage breakdown */}
        <Panel title="커널 단계별 지연 분해 (클러스터 평균)" legend={LATENCY_STAGES}>
          <StackedArea data={latency.stageSeries} stages={LATENCY_STAGES} valueFormat={formatMs} />
        </Panel>

        {/* distribution */}
        <Panel title={`지연 분포 ${namespace === "all" ? "(전체)" : `(${namespace})`}`}>
          <Histogram
            buckets={buckets}
            color="#38bdf8"
            xFormat={(v) => formatMs(v)}
            markers={[
              { value: last.p95, label: "p95", color: "#fbbf24" },
              { value: last.p99, label: "p99", color: "#f43f5e" },
            ]}
          />
        </Panel>
      </div>

      {/* heatmap */}
      <Panel className="mt-4" title={`Pod × 시간 지연 히트맵 · ${heatRows.length} pods`} hint="셀/행 클릭 → 단계별 상세">
        <Heatmap
          rows={heatRows}
          times={times}
          valueFormat={formatMs}
          colorMax={colorMax}
          selectedUid={selectedUid}
          onSelect={(uid) => setSelectedUid(uid === selectedUid ? null : uid)}
        />
      </Panel>

      {/* drill-down */}
      {selected && (
        <Panel className="mt-4" title={`${selected.namespace}/${selected.pod}`} hint={selected.node}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <div className="space-y-1 text-sm">
                <Stat label="p50" value={formatMs(selected.p50)} />
                <Stat label="p95" value={formatMs(selected.p95)} />
                <Stat label="p99" value={formatMs(selected.p99)} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">현재 단계별 분해</div>
              <HorizontalBar
                data={LATENCY_STAGES.map((s) => ({
                  key: s.key,
                  label: s.label,
                  value: selected.stages[s.key] ?? 0,
                  color: s.color,
                }))}
                valueFormat={formatMs}
              />
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

function Panel({
  title,
  hint,
  legend,
  className = "",
  children,
}: {
  title: string;
  hint?: string;
  legend?: { key: string; label: string; color: string }[];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
        {hint ? <span className="text-xs text-zinc-500">{hint}</span> : null}
      </div>
      {legend && (
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
          {legend.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <span className="h-2 w-2 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
      {children}
    </section>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active ? "bg-zinc-100 text-zinc-900" : "border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-zinc-900/60 px-3 py-1.5">
      <span className="text-zinc-500">{label}</span>
      <span className="font-semibold tabular-nums text-zinc-100">{value}</span>
    </div>
  );
}
