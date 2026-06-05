"use client";

import { useMemo, useState } from "react";
import { type Pod } from "../../lib/k8s";
import { BASE_NOW } from "../../lib/mock-cluster";
import {
  DROP_REASONS,
  DROP_REASON_BY_CODE,
  type DropData,
  dropsByBucket,
  dropsByPod,
  dropsByReason,
} from "../../lib/telemetry";
import { hhmm } from "../charts/chartUtils";
import HorizontalBar from "../charts/HorizontalBar";
import LineChart from "../charts/LineChart";
import Heatmap, { type HeatRow } from "../charts/Heatmap";
import Honeycomb from "../Honeycomb";
import PodDetail from "../PodDetail";

export default function DropsView({ drops, pods }: { drops: DropData; pods: Pod[] }) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [detailPod, setDetailPod] = useState<Pod | null>(null);

  const podByUid = useMemo(() => new Map(pods.map((p) => [p.uid, p])), [pods]);
  const allEvents = drops.events;

  const filtered = useMemo(
    () =>
      allEvents.filter(
        (e) =>
          (selectedReason ? e.reason === selectedReason : true) &&
          (selectedUid ? e.uid === selectedUid : true),
      ),
    [allEvents, selectedReason, selectedUid],
  );

  const total = allEvents.reduce((s, e) => s + e.count, 0);
  const byReason = useMemo(() => dropsByReason(allEvents), [allEvents]);
  const byPod = useMemo(() => dropsByPod(allEvents), [allEvents]);
  const topReason = byReason[0];
  const topPod = byPod[0];
  const alertUids = useMemo(() => new Set(byPod.map((p) => p.uid)), [byPod]);

  // timeline: one line per reason present
  const reasonSeries = useMemo(
    () =>
      byReason.map(({ key }) => ({
        key,
        label: DROP_REASON_BY_CODE[key]?.label ?? key,
        color: DROP_REASON_BY_CODE[key]?.color ?? "#a1a1aa",
        points: dropsByBucket(
          allEvents.filter((e) => e.reason === key),
          drops.buckets,
        ),
      })),
    [byReason, allEvents, drops.buckets],
  );

  // heatmap: pod × time (respects current reason filter)
  const heatScopeEvents = selectedReason
    ? allEvents.filter((e) => e.reason === selectedReason)
    : allEvents;
  const heatRows: HeatRow[] = useMemo(() => {
    return dropsByPod(heatScopeEvents).slice(0, 24).map((p) => {
      const evs = heatScopeEvents.filter((e) => e.uid === p.uid);
      return {
        uid: p.uid,
        label: p.key,
        sub: p.node,
        values: dropsByBucket(evs, drops.buckets).map((pt) => pt.v),
      };
    });
  }, [heatScopeEvents, drops.buckets]);

  const runningPods = useMemo(() => pods.filter((p) => p.phase === "Running"), [pods]);

  return (
    <div className="px-6 py-6">
      <header className="mb-5">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Phase 1 · 기능 2</div>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-50">패킷 Drop &amp; 상세 오류 탐지</h1>
        <p className="mt-1 text-sm text-zinc-500">
          skb_drop 추적으로 네트워크 유실의 정확한 지점(node/pod)·시점·원인(에러코드)을 매핑
        </p>
      </header>

      {/* KPI */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="총 Drop" value={total.toLocaleString()} sub={`${allEvents.length} events`} accent="#f43f5e" />
        <Kpi
          label="최다 원인"
          value={topReason ? DROP_REASON_BY_CODE[topReason.key]?.label ?? topReason.key : "—"}
          sub={topReason ? `${topReason.count.toLocaleString()} drops` : ""}
          accent={topReason ? DROP_REASON_BY_CODE[topReason.key]?.color : undefined}
        />
        <Kpi label="최다 발생 Pod" value={topPod?.key ?? "—"} sub={topPod ? `${topPod.count.toLocaleString()} drops` : ""} accent="#fbbf24" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* reason distribution */}
        <Panel title="원인별 분포" hint={selectedReason ? "필터 해제하려면 다시 클릭" : "클릭 → 필터"}>
          <HorizontalBar
            data={byReason.map((r) => ({
              key: r.key,
              label: DROP_REASON_BY_CODE[r.key]?.label ?? r.key,
              value: r.count,
              color: DROP_REASON_BY_CODE[r.key]?.color,
            }))}
            valueFormat={(v) => v.toLocaleString()}
            selectedKey={selectedReason}
            onSelect={(k) => setSelectedReason(k === selectedReason ? null : k)}
          />
        </Panel>

        {/* reason mapping table */}
        <Panel title="SKB_DROP_REASON 매핑">
          <div className="space-y-1">
            {DROP_REASONS.map((r) => {
              const active = r.code === selectedReason;
              return (
                <button
                  key={r.code}
                  onClick={() => setSelectedReason(active ? null : r.code)}
                  className={`flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition hover:bg-zinc-800/60 ${
                    active ? "bg-zinc-800" : ""
                  }`}
                >
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-sm" style={{ background: r.color }} />
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-zinc-200">{r.label}</span>
                    <span className="block text-[11px] text-zinc-500">{r.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* timeline */}
      <Panel className="mt-4" title="Drop 발생 추이 (원인별)" hint="분당 drop 건수">
        <LineChart series={reasonSeries} valueFormat={(v) => `${Math.round(v)}`} />
      </Panel>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* topology overlay */}
        <Panel title="토폴로지 — Drop 발생 Pod" hint={`${alertUids.size} pods`}>
          <Honeycomb
            pods={runningPods}
            visibleUids={selectedUid ? new Set([selectedUid]) : new Set()}
            selectedUid={selectedUid}
            alertUids={alertUids}
            onSelectPod={(p) => {
              setSelectedUid(p.uid === selectedUid ? null : p.uid);
            }}
          />
        </Panel>

        {/* heatmap */}
        <Panel title={`Pod × 시간 Drop 히트맵 · ${heatRows.length} pods`} hint="행 클릭 → 필터">
          <Heatmap
            rows={heatRows}
            times={drops.buckets}
            valueFormat={(v) => `${Math.round(v)} drops`}
            selectedUid={selectedUid}
            onSelect={(uid) => setSelectedUid(uid === selectedUid ? null : uid)}
          />
        </Panel>
      </div>

      {/* events table */}
      <Panel
        className="mt-4"
        title="Drop 이벤트"
        hint={`${filtered.length}건${selectedReason || selectedUid ? " (필터됨)" : ""}`}
      >
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-900/95 text-zinc-500">
              <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:font-medium">
                <th>시각</th>
                <th>Namespace / Pod</th>
                <th>Node</th>
                <th>Reason</th>
                <th>src → dst</th>
                <th className="text-right">건수</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {filtered.slice(0, 200).map((e) => {
                const reason = DROP_REASON_BY_CODE[e.reason];
                return (
                  <tr
                    key={e.id}
                    onClick={() => setDetailPod(podByUid.get(e.uid) ?? null)}
                    className="cursor-pointer border-t border-zinc-800/70 [&>td]:px-2 [&>td]:py-1.5 hover:bg-zinc-800/50"
                  >
                    <td className="tabular-nums text-zinc-400">{hhmm(e.t)}</td>
                    <td>
                      <span className="text-zinc-500">{e.namespace}/</span>
                      <span className="text-zinc-200">{e.pod}</span>
                    </td>
                    <td className="text-zinc-400">{e.node}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-sm" style={{ background: reason?.color ?? "#a1a1aa" }} />
                        <span className="font-mono text-[11px]">{reason?.label ?? e.reason}</span>
                      </span>
                    </td>
                    <td className="font-mono text-[11px] text-zinc-500">
                      {e.srcIP} → {e.dstIP}
                    </td>
                    <td className="text-right font-medium tabular-nums">{e.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <PodDetail pod={detailPod} now={BASE_NOW} onClose={() => setDetailPod(null)} />
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tabular-nums" style={{ color: accent ?? "#fafafa" }}>
        {value}
      </div>
      {sub ? <div className="text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function Panel({
  title,
  hint,
  className = "",
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
        {hint ? <span className="text-xs text-zinc-500">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}
