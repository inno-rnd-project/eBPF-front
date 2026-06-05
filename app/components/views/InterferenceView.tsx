"use client";

import { useMemo, useState } from "react";
import {
  INTERFERENCE_CONTRIB,
  type ContribKey,
  type InterferenceData,
} from "../../lib/telemetry";
import LineChart from "../charts/LineChart";
import MatrixHeatmap from "../charts/MatrixHeatmap";
import ImpactGraph, { type ImpactNode } from "../charts/ImpactGraph";

const PEER_COLORS = ["#38bdf8", "#a78bfa", "#34d399"];

export default function InterferenceView({ data }: { data: InterferenceData }) {
  const byUid = useMemo(() => new Map(data.pods.map((p) => [p.uid, p])), [data]);
  const [selectedUid, setSelectedUid] = useState<string>(data.pods[0]?.uid ?? "");

  const leaders = data.pods.slice(0, 12);
  const maxScore = Math.max(1, ...leaders.map((p) => p.score));
  const selected = byUid.get(selectedUid) ?? data.pods[0];

  const highCount = data.pods.filter((p) => p.score >= 50).length;
  const avgScore = data.pods.reduce((s, p) => s + p.score, 0) / Math.max(1, data.pods.length);

  // top correlated peers of the selected pod (from the Pearson matrix)
  const peers = useMemo(() => {
    const { entities, r } = data.correlation;
    const idx = entities.findIndex((e) => e.uid === selectedUid);
    if (idx < 0) return [];
    return entities
      .map((e, j) => ({ uid: e.uid, r: r[idx][j] }))
      .filter((e) => e.uid !== selectedUid && e.r > 0.3)
      .sort((a, b) => b.r - a.r)
      .slice(0, 3);
  }, [data, selectedUid]);

  const series = useMemo(() => {
    const out = [];
    if (selected) {
      out.push({ key: selected.uid, label: selected.pod, color: "#f43f5e", points: selected.series });
    }
    peers.forEach((pe, i) => {
      const p = byUid.get(pe.uid);
      if (p) out.push({ key: p.uid, label: `${p.pod} (r=${pe.r.toFixed(2)})`, color: PEER_COLORS[i], points: p.series });
    });
    return out;
  }, [selected, peers, byUid]);

  // impact targets of the selected pod
  const targets: ImpactNode[] = useMemo(() => {
    return data.impact
      .filter((e) => e.from === selectedUid)
      .map((e) => {
        const p = byUid.get(e.to);
        return p ? { uid: p.uid, label: p.pod, score: p.score, weight: e.weight } : null;
      })
      .filter((x): x is ImpactNode => x !== null);
  }, [data, selectedUid, byUid]);

  return (
    <div className="px-6 py-6">
      <header className="mb-5">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Phase 1 · 기능 3·4·5</div>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-50">워크로드 간섭 분석</h1>
        <p className="mt-1 text-sm text-zinc-500">
          시스템 전체를 느리게 만드는 ‘간섭 유발’ Pod Top-N · Pearson 상관계수 · 영향 범위 분석
        </p>
      </header>

      {/* KPI */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Top Interferer" value={data.pods[0]?.pod ?? "—"} sub={data.pods[0] ? `score ${data.pods[0].score.toFixed(0)}` : ""} accent="#f43f5e" />
        <Kpi label="평균 간섭 점수" value={avgScore.toFixed(1)} sub="cluster avg" accent="#fbbf24" />
        <Kpi label="고간섭 Pod" value={`${highCount}`} sub="score ≥ 50" accent="#a78bfa" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* leaderboard */}
        <Panel title="간섭 유발 Top-N" hint="클릭 → 선택" legend={INTERFERENCE_CONTRIB}>
          <div className="space-y-1.5">
            {leaders.map((p, i) => {
              const sel = p.uid === selectedUid;
              return (
                <button
                  key={p.uid}
                  onClick={() => setSelectedUid(p.uid)}
                  className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition hover:bg-zinc-800/60 ${
                    sel ? "bg-zinc-800" : ""
                  }`}
                >
                  <span className="w-4 shrink-0 text-right text-xs tabular-nums text-zinc-600">{i + 1}</span>
                  <span className="w-40 shrink-0 truncate text-xs text-zinc-200" title={`${p.namespace}/${p.pod}`}>
                    {p.pod}
                    <span className="block truncate text-[10px] text-zinc-600">{p.node}</span>
                  </span>
                  <span className="flex h-3.5 flex-1 overflow-hidden rounded bg-zinc-800/70">
                    {INTERFERENCE_CONTRIB.map((c) => (
                      <span
                        key={c.key}
                        style={{ width: `${(p.contrib[c.key as ContribKey] / maxScore) * 100}%`, background: c.color }}
                        title={`${c.label} ${p.contrib[c.key as ContribKey].toFixed(1)}`}
                      />
                    ))}
                  </span>
                  <span className="w-9 shrink-0 text-right text-sm font-semibold tabular-nums text-zinc-100">
                    {p.score.toFixed(0)}
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        {/* selected pod time-series */}
        <Panel
          title={selected ? `간섭 추이 — ${selected.pod}` : "간섭 추이"}
          hint="선택 Pod + 상관 높은 피어"
        >
          {series.length > 0 ? (
            <LineChart series={series} valueFormat={(v) => v.toFixed(0)} />
          ) : (
            <div className="py-10 text-center text-xs text-zinc-600">Pod를 선택하세요</div>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* correlation matrix */}
        <Panel title="Pearson 상관계수 매트릭스" hint="간섭 시계열 · Top 14">
          <div className="mb-2 flex items-center gap-3 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm" style={{ background: "rgb(56,189,248)" }} /> -1
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-zinc-800" /> 0
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm" style={{ background: "rgb(244,63,94)" }} /> +1
            </span>
          </div>
          <MatrixHeatmap matrix={data.correlation} selectedUid={selectedUid} onSelect={setSelectedUid} />
        </Panel>

        {/* impact graph */}
        <Panel title="영향 그래프" hint={selected ? `${selected.pod} → 영향받는 Pod` : ""}>
          {selected && (
            <ImpactGraph
              center={{ uid: selected.uid, label: selected.pod, score: selected.score }}
              targets={targets}
              onSelect={setSelectedUid}
            />
          )}
        </Panel>
      </div>

      <p className="mt-4 text-xs text-zinc-600">
        ※ 영향 방향: 점수가 높은 Pod가 상관(r&gt;0.45) 높은 낮은-점수 Pod의 간섭 원인일 가능성으로 추정. node/pod 부하테스트
        자동화 에이전트 연동은 후속 예정.
      </p>
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
