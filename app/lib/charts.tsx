// ───────────────────────────────────────────────────────────────────────────
// 드릴다운 차트 컴포넌트 (순수 서버 컴포넌트, SVG/CSS 기반 — 외부 라이브러리 없음)
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";

import {
  C_CRIT,
  C_WARN,
  type Diagnosis,
  DIM_LABEL,
  DIM_METRIC,
  type CudaActivity,
  type DropReasonRow,
  type GpuDeviceView,
  type GpuEvent,
  type GpuInfo,
  type GpuInterconnect,
  type GpuMemStack,
  type GpuProcess,
  type GpuVerdict,
  HEX_CLIP,
  type NetFlow,
  type NetobsAgentHealth,
  type NodeAlert,
  type NodeHealth,
  type NoisyNeighbor,
  NOISY_SIGNALS,
  NOISY_SIGNAL_LABEL,
  type PodGpuUsage,
  rampColor,
  type Severity,
  SEV_TONE,
} from "./cluster";
import { GpuLivePanel } from "./gpu-live";
import { SectionTitle } from "./shell";
import { type TabDef, Tabs } from "./tabs";
import { EmptyState } from "./ui";

// ── 진단 카드 (Root Cause verdict) — 페이지 최상단의 "답" ────────────────────────

export function DiagnosisCard({ node, dx }: { node: string; dx: Diagnosis }) {
  const ok = dx.severity === "ok";
  const tone =
    dx.severity === "ok"
      ? { fill: "#10b981", stroke: "#34d399", text: "#047857", bg: "#ecfdf5", label: "정상" }
      : SEV_TONE[dx.severity];
  const fmtScore = (s: number) => (dx.dimension === "net" ? `${s}/s` : s.toFixed(2));

  return (
    <div
      className="anim-rise overflow-hidden rounded-2xl border bg-white shadow-sm"
      style={{ borderColor: tone.stroke }}
    >
      <div className="flex items-stretch">
        {/* 좌측 강조 바 */}
        <div className="w-1.5 shrink-0" style={{ backgroundColor: tone.fill }} />
        <div className="min-w-0 flex-1 p-5">
          {/* 상단 메타 */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: tone.bg, color: tone.text }}>
              {tone.label}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {DIM_LABEL[dx.dimension]} · {DIM_METRIC[dx.dimension]}
            </span>
            <span className="ml-auto text-[11px] text-slate-500">
              confidence <span className="font-semibold text-slate-600">{Math.round(dx.confidence * 100)}%</span>
            </span>
          </div>

          {/* 결론 */}
          <h2 className="text-lg font-bold tracking-tight" style={{ color: ok ? "#0f172a" : tone.text }}>
            {dx.headline}
          </h2>
          <p className="mt-1 text-[13px] text-slate-600">{dx.detail}</p>

          {/* 원인 신호 (eBPF 관측 / control-plane) */}
          {dx.ebpf.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span
                  className={`flex h-3.5 items-center justify-center px-1 text-[8px] font-black text-white ${HEX_CLIP} ${
                    dx.signalSource === "ebpf" ? "w-3.5 bg-indigo-500" : "bg-slate-400"
                  }`}
                >
                  {dx.signalSource === "ebpf" ? "e" : "k8s"}
                </span>
                {dx.signalSource === "ebpf" ? "eBPF 신호" : "감지 신호 (control-plane)"}
              </p>
              <ul className="space-y-1">
                {dx.ebpf.map((line) => (
                  <li key={line} className="flex gap-2 text-[12px] leading-snug text-slate-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-indigo-400" />
                    <span className="font-mono">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 원인 후보 파드 */}
          {dx.culprits.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">원인 후보</p>
              <div className="flex flex-wrap gap-2">
                {dx.culprits.map((c, i) => (
                  <Link
                    key={c.pod}
                    href={`/clusters/${node}/${c.pod}`}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] transition-colors hover:border-slate-400 hover:bg-slate-50"
                  >
                    {i === 0 && <span className="text-[10px] font-bold text-rose-500">TOP</span>}
                    <span className="font-mono font-medium text-slate-700">{c.pod}</span>
                    <span className="font-mono text-slate-500">{fmtScore(c.score)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 인과 사슬 */}
          {dx.chain && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              <span className="font-semibold text-slate-500">인과</span>
              <span className="font-mono">{dx.chain}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// health 0..1 → 색 (1=초록, 0=빨강)
function healthColor(v: number) {
  return rampColor((1 - v) * 100);
}

// health 0..1 → 텍스트 색 클래스. 임계 일관: <0.5 위험 · <0.75 경고 · else 정상.
// StatChip 등 0..1 건강 지표의 톤을 한 곳에서 결정해 페이지 간 색 기준을 통일.
export function healthToneClass(v: number) {
  return v < 0.5 ? "text-rose-600" : v < 0.75 ? "text-amber-600" : "text-emerald-600";
}

export function HealthScores({ scores }: { scores: NodeHealth }) {
  const items: [string, number][] = [
    ["CPU", scores.cpu],
    ["Network", scores.net],
    ["Memory", scores.mem],
  ];
  if (scores.gpu != null) items.unshift(["GPU", scores.gpu]);
  return (
    <div className={`grid grid-cols-2 gap-3 ${items.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
      {items.map(([label, v], idx) => {
        const color = healthColor(v);
        return (
          <div key={label} className="surface-card anim-rise rounded-xl px-4 py-3" style={{ animationDelay: `${idx * 60}ms` }}>
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label} health</span>
            <p className="mt-1 text-2xl font-bold" style={{ color }}>
              {v.toFixed(2)}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="anim-growx h-full rounded-full"
                style={{ width: `${Math.round(v * 100)}%`, backgroundColor: color, transformOrigin: "left center", animationDelay: `${idx * 60 + 120}ms` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 가로 막대 목록. kind="score" → 값(0..1) 그대로 색, "rate" → 최댓값 대비 정규화.
// severity/note가 있는 항목은 막대 자체에 이상 배지 + 원인 신호를 인라인으로 표시 —
// 별도 패널 없이 데이터만 보고 "어느 파드가 진짜 이상이고 왜인지" 한눈에 파악.
export type ScoreItem = {
  label: string;
  value: number;
  severity?: Severity; // 카탈로그된 이상이면 표시 (없으면 단순 사용률 파생)
  note?: string; // 원인 신호 한 줄 (예: cgroup throttled 41% · runqueue 27ms · …)
};

export function ScoreBars({
  items,
  kind = "score",
  unit = "",
  href,
}: {
  items: ScoreItem[];
  kind?: "score" | "rate";
  unit?: string;
  href?: (label: string) => string;
}) {
  if (!items.length) return <EmptyState message="데이터 없음" />;
  const max = Math.max(...items.map((i) => i.value), kind === "score" ? 1 : 0.0001);
  return (
    <ul className="space-y-1.5">
      {items.map((it, idx) => {
        const pct = Math.round((it.value / max) * 100);
        const color = kind === "score" ? rampColor(it.value * 100) : rampColor((it.value / max) * 100);
        const tone = it.severity ? SEV_TONE[it.severity] : null;
        const name =
          href != null ? (
            <Link href={href(it.label)} className="truncate text-slate-600 hover:text-sky-600 hover:underline" title={it.label}>
              {it.label}
            </Link>
          ) : (
            <span className="truncate text-slate-600" title={it.label}>
              {it.label}
            </span>
          );
        return (
          <li key={it.label} className={tone ? "rounded-md bg-slate-50/70 px-1.5 py-1" : ""}>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="flex w-56 shrink-0 items-center gap-1.5 font-mono">
                {tone ? (
                  <span
                    className="shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide"
                    style={{ backgroundColor: tone.bg, color: tone.text }}
                  >
                    {tone.label}
                  </span>
                ) : null}
                {name}
              </span>
              <span className="relative h-3 flex-1 overflow-hidden rounded bg-slate-100">
                <span
                  className="anim-growx absolute inset-y-0 left-0 rounded"
                  style={{ width: `${pct}%`, backgroundColor: color, animationDelay: `${Math.min(idx, 10) * 45}ms` }}
                />
                {it.severity === "crit" ? <span className="shimmer-band" /> : null}
              </span>
              <span className="w-14 shrink-0 text-right font-mono font-semibold text-slate-700">
                {kind === "score" ? it.value.toFixed(2) : `${it.value}${unit}`}
              </span>
            </div>
            {it.note ? (
              <p className="mt-0.5 truncate pl-1 font-mono text-[11px] text-slate-500" title={it.note}>
                ↳ {it.note}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// eBPF stage latency 파이프라인
export function StageLatency({ stages, bottleneck }: { stages: { stage: string; p99: number }[]; bottleneck: string }) {
  const max = Math.max(...stages.map((s) => s.p99), 1);
  return (
    <ul className="space-y-2">
      {stages.map((s, idx) => {
        const isB = s.stage === bottleneck;
        const pct = Math.round((s.p99 / max) * 100);
        return (
          <li key={s.stage} className="flex items-center gap-2 text-[12px]">
            <span className="w-5 shrink-0 text-right text-slate-300">{idx + 1}</span>
            <span className="w-40 shrink-0 font-mono text-slate-600">{s.stage}</span>
            <span className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100">
              <span
                className="anim-growx absolute inset-y-0 left-0 rounded"
                style={{ width: `${pct}%`, backgroundColor: isB ? "#e0473a" : "#6366f1", animationDelay: `${Math.min(idx, 10) * 55}ms` }}
              />
              {isB ? <span className="shimmer-band" /> : null}
            </span>
            <span className="w-16 shrink-0 text-right font-mono font-semibold text-slate-700">{s.p99}µs</span>
            <span className="w-12 shrink-0 text-[10px] font-bold text-rose-600">{isB ? "← 병목" : ""}</span>
          </li>
        );
      })}
    </ul>
  );
}

function PodCell({ ns, pod, highlight, tone }: { ns: string; pod: string; highlight?: string; tone: "suspect" | "victim" }) {
  const hit = pod === highlight;
  const color = tone === "suspect" ? "text-rose-600" : "text-slate-700";
  return (
    <td className="pr-3 align-top">
      <div className={`font-mono ${color} ${hit ? "font-bold" : ""}`}>{pod}</div>
      <div className="text-[10px] text-slate-500">{ns}</div>
    </td>
  );
}

const fmtLag = (s: number) => `${s > 0 ? "+" : ""}${s}s`;

export function NoisyTable({ rows, highlight, showSignal }: { rows: NoisyNeighbor[]; highlight?: string; showSignal?: boolean }) {
  if (!rows.length) return <EmptyState message="데이터 없음" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12px] whitespace-nowrap">
        <thead>
          <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-3">#</th>
            {showSignal ? <th className="pr-3">signal</th> : null}
            <th className="pr-3">suspect</th>
            <th className="pr-3">victim</th>
            <th className="pr-3 text-right">lag</th>
            <th className="pr-3 text-right">impact</th>
            <th className="pr-3 text-right">causal_strength</th>
            <th className="text-right">score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
              <td className="py-1.5 pr-3 align-top text-slate-500">{r.rank}</td>
              {showSignal ? (
                <td className="pr-3 align-top">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    {NOISY_SIGNAL_LABEL[r.signal]}
                  </span>
                </td>
              ) : null}
              <PodCell ns={r.suspectNs} pod={r.suspect} highlight={highlight} tone="suspect" />
              <PodCell ns={r.victimNs} pod={r.victim} highlight={highlight} tone="victim" />
              <td className="pr-3 text-right align-top font-mono text-slate-500">{fmtLag(r.lagSeconds)}</td>
              <td className="pr-3 text-right align-top font-mono text-slate-500">{r.impactSeconds}s</td>
              <td className="pr-3 text-right align-top font-mono text-slate-500">{r.causalStrength.toExponential(2)}</td>
              <td className="text-right align-top font-mono font-semibold text-slate-800">{r.score.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 간섭 — victim_signal 별로 하위 탭을 만들어 분류. "전체" 탭은 모든 signal 합본(signal 열 표시).
export function NoisyPanel({ rows, highlight }: { rows: NoisyNeighbor[]; highlight?: string }) {
  if (!rows.length) return <EmptyState message="간섭 신호 없음 — 이웃 간 자원 경합이 감지되지 않았습니다" />;
  const present = NOISY_SIGNALS.filter((s) => rows.some((r) => r.signal === s));
  const tabs: TabDef[] = [
    {
      id: "all",
      label: "전체",
      badge: rows.length,
      content: <NoisyTable rows={rows} highlight={highlight} showSignal />,
    },
    ...present.map((s) => {
      const sub = rows.filter((r) => r.signal === s);
      return {
        id: s,
        label: NOISY_SIGNAL_LABEL[s],
        badge: sub.length,
        content: <NoisyTable rows={sub} highlight={highlight} />,
      };
    }),
  ];
  return <Tabs tabs={tabs} />;
}

// ── Pod 자원 테이블 — 노드의 파드를 표로 (CPU/Mem/Net + 상태), 이상 우선 정렬.
// 허니콤이 "건강 분포"라면 이 표는 "어느 파드가 무엇을 얼마나 쓰나"의 답.
// Grafana K8s Nodes / New Relic host / GKE node 의 pods-on-node 테이블 관례.
export type PodState = "crit" | "warn" | "ok" | "nodata";
const POD_STATE_TONE: Record<PodState, { dot: string; text: string; label: string }> = {
  crit: { dot: C_CRIT, text: "text-rose-600", label: "위험" },
  warn: { dot: C_WARN, text: "text-amber-600", label: "경고" },
  ok: { dot: "#10b981", text: "text-emerald-600", label: "정상" },
  nodata: { dot: "#cbd5e1", text: "text-slate-500", label: "데이터 없음" },
};
const metricTone = (v: number) => (v >= 80 ? "text-rose-600" : v >= 60 ? "text-amber-600" : "text-slate-700");

// 셀 값 — pct 가 있으면 게이지 막대(% 표기), 없으면 원값 텍스트(cores·MiB·KB/s), null 이면 "—"
export type PodMetricCell = { pct?: number; text: string } | null;
export type PodResourceRow = {
  pod: string;
  state: PodState;
  cpu: PodMetricCell;
  mem: PodMetricCell;
  net: PodMetricCell;
  sortValue: number; // 같은 state 내 정렬 축 (내림차순)
};

export function PodResourceTable({ rows: input, href }: { rows: PodResourceRow[]; href: (pod: string) => string }) {
  if (!input.length) return <EmptyState message="파드 없음" />;
  const rank: Record<PodState, number> = { crit: 0, warn: 1, ok: 2, nodata: 3 };
  const rows = [...input].sort((a, b) => rank[a.state] - rank[b.state] || b.sortValue - a.sortValue);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-3">Pod</th>
            <th className="py-1.5 pr-3 text-right">CPU</th>
            <th className="py-1.5 pr-3 text-right">Memory</th>
            <th className="py-1.5 pr-3 text-right">Network</th>
            <th className="py-1.5 text-right">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ pod, state, cpu, mem, net }, ri) => {
            const tone = POD_STATE_TONE[state];
            // Grafana table "gauge cell" — 값 뒤에 사용률 막대를 깔아 한눈에 비교 (% 값만).
            const cell = (c: PodMetricCell) =>
              c == null ? (
                <span className="flex h-full items-center justify-end pr-0.5 text-slate-300">—</span>
              ) : c.pct == null ? (
                <span className="flex h-6 items-center justify-end pr-1.5 text-slate-600">{c.text}</span>
              ) : (
                <span className="relative flex h-6 items-center justify-end overflow-hidden rounded">
                  <span
                    className="anim-growx absolute inset-y-0 left-0 rounded"
                    style={{ width: `${Math.min(c.pct, 100)}%`, backgroundColor: rampColor(c.pct), opacity: 0.18, transformOrigin: "left center", animationDelay: `${Math.min(ri, 12) * 30}ms` }}
                  />
                  <span className={`relative z-10 pr-1.5 ${metricTone(c.pct)}`}>{c.text}</span>
                </span>
              );
            return (
              <tr key={pod} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70">
                <td className="py-1.5 pr-3">
                  <Link href={href(pod)} className="font-mono font-medium text-slate-700 underline-offset-2 hover:text-sky-600 hover:underline">
                    {pod}
                  </Link>
                </td>
                <td className="py-1.5 pr-3 text-right font-mono font-semibold tabular-nums">{cell(cpu)}</td>
                <td className="py-1.5 pr-3 text-right font-mono font-semibold tabular-nums">{cell(mem)}</td>
                <td className="py-1.5 pr-3 text-right font-mono font-semibold tabular-nums">{cell(net)}</td>
                <td className="py-1.5 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone.dot }} />
                    <span className={`text-[11px] font-medium ${tone.text}`}>{tone.label}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AlertList({ node, alerts }: { node: string; alerts: NodeAlert[] }) {
  if (!alerts.length) return <EmptyState message="발생 중인 알림 없음" />;
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => {
        const tone = SEV_TONE[a.severity];
        const row = (
          <span className="flex items-center gap-3 rounded-lg border border-l-2 border-slate-100 px-3 py-2" style={{ borderLeftColor: tone.fill }}>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ backgroundColor: tone.bg, color: tone.text }}>
              {tone.label}
            </span>
            <span className="font-mono text-[13px] font-semibold text-slate-800">{a.name}</span>
            {a.pod ? <span className="truncate font-mono text-[12px] text-slate-500">{a.pod}</span> : null}
            <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{a.component}</span>
          </span>
        );
        return (
          <li key={i} className="anim-rise" style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}>
            {a.pod ? (
              <Link href={`/clusters/${node}/${a.pod}`} className="block rounded-lg transition-colors hover:bg-slate-50">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}

// 작은 통계 칩
export function StatChip({ label, value, sub, tone = "text-slate-900" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${tone}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

// ── 사용률 게이지 — 노드 vitals 의 핵심 KPI 타일 ──────────────────────────────
// Grafana Node Exporter 게이지 패널 / Datadog·Cloud Monitoring 단일값 타일의 관례:
// 임계 색(rampColor: 정상→경고→심각) 링으로 "부하"를 인코딩하고 중앙에 현재값(%),
// 아래에 용량 맥락(used/total)을 둔다. pct(0..100)가 링 채움+색을 결정.
export function GaugeStat({
  label,
  pct,
  center,
  sub,
}: {
  label: string;
  pct: number;
  center?: string; // 중앙 표시값 (기본: 반올림 %)
  sub?: string; // 용량/맥락 한 줄
}) {
  const safe = Math.max(0, Math.min(100, pct));
  const color = rampColor(pct);
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  const dash = (safe / 100) * CIRC;
  return (
    <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-3 py-4 transition-shadow hover:shadow-sm">
      <div className="relative h-[76px] w-[76px]">
        {/* 12시 방향에서 시계방향으로 채우도록 -90° 회전 */}
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="#f1f5f9" strokeWidth="9" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${dash.toFixed(2)} ${CIRC.toFixed(2)}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[19px] font-bold leading-none tabular-nums text-slate-900">
            {center ?? `${Math.round(safe)}%`}
          </span>
        </div>
      </div>
      <p className="mt-2.5 text-[12px] font-semibold text-slate-700">{label}</p>
      {sub ? <p className="mt-0.5 text-center text-[11px] leading-tight text-slate-500">{sub}</p> : null}
    </div>
  );
}

// ── GPU 대시보드 (GPU 노드 드릴다운 전용 — Grafana eBPF GPU 대시보드 미러링) ────
// 디바이스 텔레메트리·throttle·교차분석은 실시간 갱신(GpuLivePanel, 클라이언트).

function GpuSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h4 className="text-[12px] font-bold text-slate-600">{title}</h4>
        {hint ? <span className="text-[10px] text-slate-500">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

// GPU 진단 배너 — 탭 최상단의 "답". 실패 모드 분류 + 인과 + 범인 + 조치.
function GpuVerdictBanner({ node, vd }: { node: string; vd: GpuVerdict }) {
  const tone =
    vd.severity === "ok"
      ? { fill: "#10b981", stroke: "#34d399", text: "#047857", bg: "#ecfdf5" }
      : SEV_TONE[vd.severity];
  const ok = vd.severity === "ok";
  return (
    <div className="anim-rise overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: tone.stroke }}>
      <div className="flex items-stretch">
        <div className="w-1.5 shrink-0" style={{ backgroundColor: tone.fill }} />
        <div className="min-w-0 flex-1 p-5">
          {/* 실패 모드 + confidence 라인 */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: tone.bg, color: tone.text }}>
              {vd.modeLabel}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">GPU · gpuobs</span>
          </div>

          {/* 결론 */}
          <h3 className="text-lg font-bold tracking-tight" style={{ color: ok ? "#0f172a" : tone.text }}>
            {vd.headline}
          </h3>
          <p className="mt-1 text-[13px] text-slate-600">{vd.detail}</p>

          {/* 인과적으로 묶은 핵심 신호 */}
          {vd.evidence.length > 0 && (
            <ul className="mt-3 space-y-1">
              {vd.evidence.map((line) => (
                <li key={line} className="flex gap-2 text-[12px] leading-snug text-slate-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                  <span className="font-mono">{line}</span>
                </li>
              ))}
            </ul>
          )}

          {/* 인과 사슬 */}
          {vd.chain && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              <span className="font-semibold text-slate-500">인과</span>
              <span className="font-mono">{vd.chain}</span>
            </div>
          )}

          {/* 범인 후보 파드 → 드릴다운 */}
          {vd.culprits.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">원인 후보{vd.culpritLabel ? ` (${vd.culpritLabel})` : ""}</p>
              <div className="flex flex-wrap gap-2">
                {vd.culprits.map((c, i) => (
                  <Link
                    key={c.pod}
                    href={`/clusters/${node}/${c.pod}`}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] transition-colors hover:border-slate-400 hover:bg-slate-50"
                  >
                    {i === 0 && <span className="text-[10px] font-bold text-rose-500">TOP</span>}
                    <span className="font-mono font-medium text-slate-700">{c.pod}</span>
                    <span className="font-mono text-slate-500">{c.score.toFixed(2)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 귀속 불가 caveat (관측불가 모드가 아닐 때만) */}
          {vd.attributionBlind && vd.mode !== "unobservable" && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
              <span className="rounded bg-amber-200 px-1 py-px text-[9px] font-bold uppercase text-amber-800">제약</span>
              파드별 CUDA 귀속 불가 (런타임 심볼 미부착) — 디바이스 레벨 신호로만 원인 규명. 아래 self-health 참고.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// gpuobs-agent 자체 헬스 (관측 신뢰도 — 진단의 전제)
export function GpuAgentPanel({ agent }: { agent: GpuInfo["agent"] }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${agent.up ? "bg-emerald-500" : "bg-rose-500"}`} />
          <span className="font-semibold text-slate-600">Agent {agent.up ? "up" : "down"}</span>
        </span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-500">
          Informer sync lag <span className="font-mono font-semibold text-slate-700">{agent.informerSyncLagS}s</span>
        </span>
      </div>

      {/* CUDA 심볼 부착 상태 */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-slate-500">
          CUDA symbol attach status
          <span className="ml-2 font-mono text-emerald-600">{agent.attachedCount} attached</span>
          <span className="ml-1.5 font-mono text-rose-600">{agent.missingCount} missing</span>
        </p>
        <div className="flex flex-wrap gap-1">
          {agent.cudaSymbols.map((s) => (
            <span
              key={s.name}
              title={s.attached ? "attached" : "missing"}
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                s.attached ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 font-semibold text-rose-700 line-through decoration-rose-300"
              }`}
            >
              {s.name}
            </span>
          ))}
        </div>
        {agent.missingCount > 0 && (
          <p className="mt-1.5 text-[11px] text-slate-500">
            런타임 API(cuda*) 미부착 → 파드별 CUDA 귀속 패널이 No data. 드라이버 API(cu*)만으로 디바이스 텔레메트리는 정상 수집.
          </p>
        )}
      </div>

      {/* NVML 호출 p99 + 에러율 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-slate-500">NVML call duration p99</p>
          <ScoreBars items={agent.nvmlP99.map((n) => ({ label: n.call, value: n.ms }))} kind="rate" unit="ms" />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-slate-500">NVML error rate</p>
          {agent.nvmlErrors.length > 0 ? (
            <ul className="space-y-1.5">
              {agent.nvmlErrors.map((e) => (
                <li key={e.code} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate font-mono text-slate-600" title={e.code}>
                    {e.code}
                  </span>
                  <span className="shrink-0 font-mono font-semibold text-rose-600">{e.rate}/s</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-slate-500">데이터 없음</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 귀속 불가(No data) 안내 — cuda* uprobe 미부착 노드의 귀속 레벨 탭 공용 ──────────
const ATTR_BLIND_REASON = "런타임 API(cudaLaunchKernel 등) uprobe 미부착 → PID·파드별 CUDA 귀속 불가. 드라이버 API(cu*)만으로 디바이스 레벨(Devices·Interconnect·Events)은 정상 수집.";
function AttributionBlind({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-4">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
        <span className="rounded bg-slate-200 px-1 py-px text-[9px] font-bold uppercase text-slate-500">No data</span>
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
        {items.map((it) => (
          <span key={it}>· {it}</span>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{ATTR_BLIND_REASON}</p>
    </div>
  );
}

// 파드 링크 — 귀속 실패(pod "—") 프로세스는 링크 없이 텍스트로
function PodLink({ node, pod }: { node: string; pod: string }) {
  if (pod === "—") return <span className="font-mono text-slate-400" title="cgroup 기반 파드 귀속 실패">—</span>;
  return (
    <Link href={`/clusters/${node}/${pod}`} className="font-mono font-medium text-slate-700 underline-offset-2 hover:text-sky-600 hover:underline">
      {pod}
    </Link>
  );
}

// ── Processes — PID별 GPU 귀속 테이블 ──────────────────────────────────────────
function GpuProcessesPanel({ processes, perPodAvailable, node }: { processes: GpuProcess[]; perPodAvailable: boolean; node: string }) {
  if (!perPodAvailable || processes.length === 0) {
    return <AttributionBlind title="PID별 GPU 프로세스 수집 불가" items={["PID / 소유 파드", "GPU memory used", "SM utilization %", "compute/graphics type"]} />;
  }
  const maxMem = Math.max(...processes.map((p) => p.memMB), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-3 font-mono">PID</th>
            <th className="py-1.5 pr-3">Pod</th>
            <th className="py-1.5 pr-3">Command</th>
            <th className="py-1.5 pr-3 text-center">Type</th>
            <th className="py-1.5 pr-3 text-right">SM%</th>
            <th className="py-1.5 text-right">GPU Mem</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((p) => (
            <tr key={p.pid} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70">
              <td className="py-1.5 pr-3 font-mono text-slate-500">{p.pid}</td>
              <td className="py-1.5 pr-3">
                <PodLink node={node} pod={p.pod} />
              </td>
              <td className="max-w-[160px] truncate py-1.5 pr-3 font-mono text-[11px] text-slate-500" title={p.command}>{p.command}</td>
              <td className="py-1.5 pr-3 text-center">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">{p.type}</span>
              </td>
              <td className="py-1.5 pr-3 text-right font-mono font-semibold text-slate-700">{Math.round(p.smUtil * 100)}%</td>
              <td className="py-1.5 text-right">
                <div className="flex items-center justify-end gap-2">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full" style={{ width: `${(p.memMB / maxMem) * 100}%`, backgroundColor: "#8b5cf6" }} />
                  </span>
                  <span className="w-16 font-mono font-semibold text-slate-700">{(p.memMB / 1024).toFixed(1)}GB</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Pods — "이 GPU를 누가 쓰는가" (GPU 관점). 프로세스를 파드로 집계 → 파드 페이지로 드릴다운 ──
function GpuPodsPanel({ view, perPodAvailable, node }: { view: GpuDeviceView; perPodAvailable: boolean; node: string }) {
  if (!perPodAvailable || view.processes.length === 0) {
    return <AttributionBlind title="이 GPU를 사용하는 파드 수집 불가" items={["파드별 SM 점유", "파드별 GPU 메모리", "프로세스 수"]} />;
  }
  const byPod = new Map<string, { smUtil: number; memMB: number; procs: number }>();
  for (const p of view.processes) {
    const e = byPod.get(p.pod) ?? { smUtil: 0, memMB: 0, procs: 0 };
    e.smUtil += p.smUtil;
    e.memMB += p.memMB;
    e.procs += 1;
    byPod.set(p.pod, e);
  }
  const rows = [...byPod.entries()].map(([pod, e]) => ({ pod, ...e })).sort((a, b) => b.memMB - a.memMB);
  const maxMem = Math.max(...rows.map((r) => r.memMB), 1);
  return (
    <div className="space-y-3">
      <p className="text-[12px] font-semibold text-slate-500">이 GPU를 사용하는 파드 ({rows.length})</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-3">Pod</th>
              <th className="py-1.5 pr-3 text-center">Procs</th>
              <th className="py-1.5 pr-3 text-right">SM%</th>
              <th className="py-1.5 text-right">GPU Mem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pod} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70">
                <td className="py-1.5 pr-3">
                  <PodLink node={node} pod={r.pod} />
                </td>
                <td className="py-1.5 pr-3 text-center font-mono text-slate-500">{r.procs}</td>
                <td className="py-1.5 pr-3 text-right font-mono font-semibold text-slate-700">{Math.round(r.smUtil * 100)}%</td>
                <td className="py-1.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full" style={{ width: `${(r.memMB / maxMem) * 100}%`, backgroundColor: "#8b5cf6" }} />
                    </span>
                    <span className="w-16 font-mono font-semibold text-slate-700">{(r.memMB / 1024).toFixed(1)}GB</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-500">GPU 관점 — 이 디바이스를 점유한 파드. 파드 클릭 → 파드의 GPU 사용 요약(반대 관점).</p>
    </div>
  );
}

// ── Pod 관점 GPU 요약 — "이 파드가 어떤 GPU를 어떻게 쓰는가" (파드 페이지에서 사용) ──
export function PodGpuPanel({ usage, node }: { usage: PodGpuUsage; node: string }) {
  if (!usage.perPodAvailable) {
    return <AttributionBlind title="이 파드의 GPU 귀속 수집 불가" items={["사용 중인 GPU", "SM utilization", "GPU memory", "kernel launches"]} />;
  }
  if (usage.entries.length === 0) {
    return <p className="text-[12px] text-slate-500">이 파드에 귀속된 GPU 프로세스가 없습니다 — 현재 GPU를 사용하고 있지 않습니다.</p>;
  }
  const totalMem = usage.entries.reduce((s, e) => s + e.memMB, 0);
  const totalLaunch = usage.entries.reduce((s, e) => s + e.launchRate, 0);
  const memTotal = usage.entries[0].memTotalMB;
  const stat = (label: string, value: string, sub?: string) => (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-bold text-slate-700">{value}</p>
      {sub ? <p className="text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("Devices", `${usage.entries.length}`, usage.entries.map((e) => `gpu=${e.deviceIndex}`).join(", "))}
        {stat("GPU memory", `${(totalMem / 1024).toFixed(1)}GB`, `/ ${(memTotal / 1024).toFixed(0)}GB`)}
        {stat("SM (max)", `${Math.round(Math.max(...usage.entries.map((e) => e.smUtil)) * 100)}%`, "디바이스별 귀속분")}
        {stat("Kernel launches", `${totalLaunch.toLocaleString()}/s`, "추정 (귀속분)")}
      </div>

      {/* 디바이스별 카드 — GPU Detail로 드릴다운 */}
      <div className="space-y-2">
        {usage.entries.map((e) => (
          <Link
            key={e.deviceName}
            href={`/clusters/${node}/gpu/${e.deviceIndex}`}
            className="group flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-violet-300 hover:bg-violet-50/40"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-violet-100 px-2 py-0.5 font-mono text-[12px] font-bold text-violet-700">GPU {e.deviceIndex}</span>
              <span className="max-w-[160px] truncate font-mono text-[11px] text-slate-500" title={e.command}>{e.command}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">{e.type}</span>
            </div>
            <div className="flex items-center gap-4 font-mono text-[11px] text-slate-600">
              <span>SM {Math.round(e.smUtil * 100)}%</span>
              <span>{(e.memMB / 1024).toFixed(1)}GB</span>
              <span className="text-slate-500">{e.launchRate.toLocaleString()}/s</span>
              <span className="text-slate-300 group-hover:text-violet-500">→</span>
            </div>
          </Link>
        ))}
      </div>
      <p className="text-[10px] text-slate-500">Pod 관점 — 이 파드가 점유한 GPU. 카드 클릭 → GPU Detail(누가 이 GPU를 쓰는지, 반대 관점).</p>
    </div>
  );
}

// ── CUDA Activity — 커널/복사 lane 타임라인 ────────────────────────────────────
const CUDA_KIND_COLOR: Record<string, string> = { kernel: "#6366f1", h2d: "#10b981", d2h: "#f59e0b", sync: "#94a3b8" };
function CudaActivityPanel({ cudaActivity }: { cudaActivity: CudaActivity | null }) {
  const a = cudaActivity;
  if (!a) {
    return <AttributionBlind title="CUDA API 활동 수집 불가" items={["kernel launch rate", "H2D / D2H transfer", "커널 실행 타임라인", "stream별 점유"]} />;
  }
  const stat = (label: string, value: string, glyph?: string, glyphColor?: string) => (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {glyph ? <span className="font-bold" style={{ color: glyphColor }}>{glyph}</span> : null}
        {label}
      </p>
      <p className="mt-0.5 font-mono text-sm font-bold text-slate-700">{value}</p>
    </div>
  );
  // 시간축 눈금 — 윈도를 4등분 (0 · 25% · 50% · 75% · end). 막대 위치를 읽는 기준선.
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const LANE_W = a.windowMs; // svg viewBox 폭과 일치
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {stat("Kernel launches", `${a.launchRate.toLocaleString()}/s`, "⚡", CUDA_KIND_COLOR.kernel)}
        {stat("H2D transfer", `${a.h2dMBs} MB/s`, "↑", CUDA_KIND_COLOR.h2d)}
        {stat("D2H transfer", `${a.d2hMBs} MB/s`, "↓", CUDA_KIND_COLOR.d2h)}
      </div>

      {/* lane 타임라인 — 각 lane에 25% 간격 그리드라인을 깔아 막대 위치를 읽게 한다 */}
      <div className="space-y-1.5">
        {a.lanes.map((laneLabel, lane) => (
          <div key={laneLabel} className="flex items-center gap-2">
            <div className="w-16 shrink-0 truncate text-right font-mono text-[10px] text-slate-500" title={laneLabel}>{laneLabel}</div>
            <svg viewBox={`0 0 ${LANE_W} 12`} preserveAspectRatio="none" className="h-3.5 w-full rounded bg-slate-50">
              {ticks.slice(1, -1).map((t) => (
                <line key={t} x1={t * LANE_W} y1={0} x2={t * LANE_W} y2={12} stroke="#e2e8f0" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
              ))}
              {a.events.filter((e) => e.lane === lane).map((e, i) => (
                <rect key={i} x={e.startMs} y={1} width={Math.max(e.durMs, 1)} height={10} rx={0.5} fill={CUDA_KIND_COLOR[e.kind]}>
                  <title>{`${e.name} · ${e.durMs}ms @ +${e.startMs}ms`}</title>
                </rect>
              ))}
            </svg>
          </div>
        ))}
        {/* 시간 눈금 라벨 — lane 막대와 같은 폭에 정렬 (좌측 라벨 칸 16 + gap 2 만큼 들여쓰기) */}
        <div className="ml-[72px] flex justify-between font-mono text-[9px] text-slate-300">
          {ticks.map((t) => (
            <span key={t}>{t === 0 ? "0" : `${Math.round(t * a.windowMs)}`}</span>
          ))}
        </div>
      </div>

      {/* 범례 */}
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span className="font-mono">최근 {a.windowMs}ms 윈도 · ms</span>
        <div className="flex flex-wrap gap-2.5">
          {(["kernel", "h2d", "d2h", "sync"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="h-1.5 w-3 rounded-sm" style={{ backgroundColor: CUDA_KIND_COLOR[k] }} />
              {k}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Memory — 파드별 VRAM stacked area ──────────────────────────────────────────
const POD_COLORS = ["#6366f1", "#8b5cf6", "#0ea5e9", "#14b8a6", "#f59e0b"];
function GpuMemoryPanel({ memSeries }: { memSeries: GpuMemStack | null }) {
  const m = memSeries;
  if (!m) {
    return <AttributionBlind title="파드별 GPU 메모리 시계열 수집 불가" items={["per-pod VRAM 사용량", "할당 추세", "메모리 점유 상위 파드"]} />;
  }
  const W = 100;
  const H = 60;
  const n = m.steps;
  const sums = Array.from({ length: n }, (_, i) => m.series.reduce((s, ser) => s + ser.values[i], 0));
  const scale = Math.max(...sums, 1) * 1.2;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - (v / scale) * H;
  // 누적 밴드
  const base = new Array(n).fill(0);
  const bands = m.series.map((ser) => {
    const low = [...base];
    const high = base.map((b, i) => b + ser.values[i]);
    for (let i = 0; i < n; i++) base[i] = high[i];
    const top = high.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    const bottom = low.map((v, i) => `${x(i)},${y(v)}`).reverse().join(" ");
    return { pod: ser.pod, points: `${top} ${bottom}`, cur: ser.values[n - 1] };
  });
  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-40 w-full rounded-lg bg-slate-50">
        <defs>
          {bands.map((b, i) => {
            const c = POD_COLORS[i % POD_COLORS.length];
            return (
              <linearGradient key={b.pod} id={`mem-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.9} />
                <stop offset="100%" stopColor={c} stopOpacity={0.45} />
              </linearGradient>
            );
          })}
        </defs>
        {bands.map((b, i) => (
          <polygon key={b.pod} points={b.points} fill={`url(#mem-${i})`} className="anim-rise" style={{ animationDelay: `${i * 70}ms` }} />
        ))}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {bands.map((b, i) => (
            <span key={b.pod} className="flex items-center gap-1.5 text-slate-500">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: POD_COLORS[i % POD_COLORS.length] }} />
              <span className="font-mono">{b.pod}</span>
              <span className="font-mono font-semibold text-slate-700">{(b.cur / 1024).toFixed(1)}GB</span>
            </span>
          ))}
        </div>
        <span className="font-mono text-slate-500">/ {(m.totalMB / 1024).toFixed(0)}GB total</span>
      </div>
    </div>
  );
}

// ── Interconnect — 고정 레이아웃 node-link + PCIe 대역폭 ────────────────────────
const IC_NODE_STYLE: Record<string, string> = {
  gpu: "border-violet-300 bg-violet-100 text-violet-700",
  cpu: "border-slate-300 bg-slate-100 text-slate-700",
  nic: "border-sky-300 bg-sky-100 text-sky-700",
};
export function GpuInterconnectPanel({ ic, caption }: { ic: GpuInterconnect; caption?: string }) {
  if (ic.nodes.length === 0) return <p className="text-[12px] text-slate-500">데이터 없음</p>;
  const byId = new Map(ic.nodes.map((nd) => [nd.id, nd]));
  return (
    <div className="space-y-3">
      <div className="relative h-64 w-full rounded-lg border border-slate-200 bg-slate-50/40">
        {/* 링크 (대역폭 = 두께·색) */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {ic.links.map((l) => {
            const a = byId.get(l.from);
            const b = byId.get(l.to);
            if (!a || !b) return null;
            const ratio = clampRatio(l.gbs / l.maxGbs);
            const key = `${l.from}-${l.to}`;
            // 유휴 링크(점유율 < 4%) — 정적 헤어라인, 모션 없음("모션은 이상에만").
            if (ratio < 0.04) {
              return (
                <line
                  key={key}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                  strokeDasharray={l.kind === "nvlink" ? "4 3" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              );
            }
            const color = rampColor(ratio * 100);
            // 흐르는 패킷 — 점유율↑ 이면 더 빠르게. from→to 방향(음수 dashoffset).
            const dur = `${Math.max(0.6, 1.9 - ratio * 1.4).toFixed(2)}s`;
            return (
              <g key={key}>
                {/* 파이프 — 대역폭 = 두께·색 */}
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={color}
                  strokeWidth={1 + ratio * 5}
                  strokeLinecap="round"
                  strokeDasharray={l.kind === "nvlink" ? "4 3" : undefined}
                  vectorEffect="non-scaling-stroke"
                  opacity={0.5}
                />
                {/* 흐름 — 파이프 위를 흐르는 밝은 패킷 띠 */}
                <line
                  className="flow-line"
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={color}
                  strokeWidth={1 + ratio * 5}
                  strokeLinecap="round"
                  strokeDasharray="1.6 9"
                  vectorEffect="non-scaling-stroke"
                  style={{ animationDuration: dur }}
                />
              </g>
            );
          })}
        </svg>
        {/* 링크 라벨 (중점) */}
        {ic.links.map((l) => {
          const a = byId.get(l.from);
          const b = byId.get(l.to);
          if (!a || !b) return null;
          return (
            <div
              key={`lbl-${l.from}-${l.to}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-white/90 px-1.5 py-0.5 text-center font-mono text-[9px] leading-tight text-slate-500 shadow-sm"
              style={{ left: `${(a.x + b.x) / 2}%`, top: `${(a.y + b.y) / 2}%` }}
            >
              <span className="font-semibold text-slate-700">{l.gbs.toFixed(1)}</span> GB/s
              <span className="block text-[8px] text-slate-500">{l.label}</span>
            </div>
          );
        })}
        {/* 노드 */}
        {ic.nodes.map((nd) => (
          <div
            key={nd.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2.5 py-1 text-center text-[11px] font-semibold shadow-sm ${IC_NODE_STYLE[nd.kind]}`}
            style={{ left: `${nd.x}%`, top: `${nd.y}%` }}
          >
            {nd.label}
          </div>
        ))}
      </div>
      {/* 범례 — 링크 종류(선 스타일) · 노드 종류(색) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 18 4" className="h-1 w-4"><line x1="0" y1="2" x2="18" y2="2" stroke="#94a3b8" strokeWidth="1.5" /></svg>
          PCIe
        </span>
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 18 4" className="h-1 w-4"><line x1="0" y1="2" x2="18" y2="2" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
          NVLink
        </span>
        <span className="text-slate-300">·</span>
        {(["gpu", "cpu", "nic"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm border ${IC_NODE_STYLE[k]}`} />
            {k.toUpperCase()}
          </span>
        ))}
        <span className="ml-auto font-mono text-slate-500">두께·색 = 점유율</span>
      </div>
      <p className="text-[10px] text-slate-500">{caption ?? "DCGM PCIe/NVLink throughput. 이 디바이스의 host(CPU/NIC) 경로 기준."}</p>
    </div>
  );
}
function clampRatio(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── Events — XID/ECC/throttle 이벤트 타임라인 ──────────────────────────────────
const EVT_DOT: Record<string, string> = { crit: "#e0473a", warn: "#f0a93b", info: "#94a3b8" };
function agoFmt(s: number) {
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
}
function GpuEventsPanel({ events, empty = "이벤트 없음" }: { events: GpuEvent[]; empty?: string }) {
  if (events.length === 0) return <p className="text-[12px] text-slate-500">{empty}</p>;
  return (
    <ol className="relative space-y-3 border-l border-slate-200 pl-5">
      {events.map((e, i) => (
        <li key={i} className="anim-rise relative" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
          <span className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: EVT_DOT[e.severity] }} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] text-slate-500">{agoFmt(e.tSecAgo)} ago</span>
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
              style={{ backgroundColor: `${EVT_DOT[e.severity]}1a`, color: EVT_DOT[e.severity] }}
            >
              {e.code}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{e.text}</p>
        </li>
      ))}
    </ol>
  );
}

// ── Anomalies — 이 디바이스의 이상 내역 (활성 이상 신호 + warn/crit 이벤트 이력) ──
// 배너(verdict)가 "왜 안 되는가"의 결론이라면 이 탭은 "무슨 이상이 있(었)나"의 목록.
// verdict 는 우세 실패 모드 하나를 고르지만, 여기선 활성 신호를 전부 나열한다 (DCGM/NVML 실측).
type GpuActiveAnomaly = { severity: Severity; code: string; text: string };

function gpuActiveAnomalies(view: GpuDeviceView): GpuActiveAnomaly[] {
  const d = view.device;
  const sm = Math.round(d.util * 100);
  const items: GpuActiveAnomaly[] = [];
  if (d.hwThermalSlowdown)
    items.push({
      severity: "crit",
      code: "HW Thermal Slowdown",
      text: `온도 ${d.tempC}°C ≥ slowdown ${d.tempSlowdownC}°C — 클럭 ${d.graphicsClockMHz}MHz 강제 하향`,
    });
  if (d.throttleReasons.includes("sw_power_cap"))
    items.push({
      severity: "warn",
      code: "SW Power Cap",
      text: `전력 ${d.powerW}W ≈ limit ${d.powerLimitW}W — power brake 활성`,
    });
  if (view.idle) {
    const cause =
      view.dominantCause === "pcie_saturated"
        ? `H2D/D2H 복사가 PCIe ${d.pcieGbs}GB/s(${Math.round((d.pcieGbs / d.pcieMaxGbs) * 100)}%)를 포화 — 피딩 정체`
        : view.dominantCause === "network_stall"
          ? "집합통신(all-reduce)이 tcp 재전송으로 블로킹 — 연산 대기"
          : "도달하는 GPU 워크로드 없음 — 미스케줄";
    // severity 기준은 deviceVerdict 의 idle 분기(health < 0.45 → crit)와 동일하게 유지
    items.push({ severity: view.health < 0.45 ? "crit" : "warn", code: "GPU Idle", text: `SM active ${sm}% — ${cause}` });
  }
  return items;
}

function GpuAnomaliesPanel({ view }: { view: GpuDeviceView }) {
  const active = gpuActiveAnomalies(view);
  const history = view.events.filter((e) => e.severity !== "info");
  return (
    <div className="space-y-6">
      <GpuSection title="활성 이상" hint="지금 걸려 있는 이상 신호 — DCGM/NVML 실측">
        {active.length ? (
          <ul className="space-y-2">
            {active.map((a, i) => {
              const tone = SEV_TONE[a.severity];
              return (
                <li
                  key={a.code}
                  className="anim-rise flex items-start gap-2.5 rounded-xl border bg-white p-3"
                  style={{ borderColor: `${tone.stroke}55`, animationDelay: `${i * 45}ms` }}
                >
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tone.fill }} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                        style={{ backgroundColor: tone.bg, color: tone.text }}
                      >
                        {a.code}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: tone.text }}>
                        {tone.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-snug text-slate-600">{a.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex items-center gap-1.5 text-[12px] text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            활성 이상 없음 — 정상 활용 중
          </p>
        )}
      </GpuSection>
      <GpuSection title="이상 이벤트 이력" hint="warn/crit 만 — 전체 로그(info 포함)는 Events 탭">
        <GpuEventsPanel events={history} empty="이상 이벤트 없음" />
      </GpuSection>
    </div>
  );
}

// ── 노드 레벨 이벤트 — 모든 디바이스 이벤트를 합쳐 GPU 배지와 함께 시간순 타임라인 ──
// (노드 Events 탭. 디바이스별 events 를 롤업 — 어느 GPU에서 무슨 일이 있었나.)
export function NodeGpuEventsTimeline({ views }: { views: GpuDeviceView[] }) {
  const events = views
    .flatMap((v) => v.events.map((e) => ({ e, device: v.device.index })))
    .sort((a, b) => a.e.tSecAgo - b.e.tSecAgo);
  if (events.length === 0) return <p className="text-[12px] text-slate-500">이벤트 없음</p>;
  return (
    <ol className="relative space-y-3 border-l border-slate-200 pl-5">
      {events.map(({ e, device }, i) => (
        <li key={i} className="anim-rise relative" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
          <span className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: EVT_DOT[e.severity] }} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] text-slate-500">{agoFmt(e.tSecAgo)} ago</span>
            <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-violet-700">GPU {device}</span>
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
              style={{ backgroundColor: `${EVT_DOT[e.severity]}1a`, color: EVT_DOT[e.severity] }}
            >
              {e.code}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{e.text}</p>
        </li>
      ))}
    </ol>
  );
}

// ── 단일 디바이스 관점 — 텔레메트리/프로세스/CUDA/메모리/인터커넥트/이벤트 6개 하위탭 ──
// 디바이스 전용 페이지(/clusters/[node]/gpu/[device])에서 렌더.
export function GpuDeviceDetail({ view, perPodAvailable, agent, node }: { view: GpuDeviceView; perPodAvailable: boolean; agent: GpuInfo["agent"]; node: string }) {
  // 정상(ok)일 땐 배너 없이 데이터만 — 사용자가 직접 보고 판단
  const showVerdict = view.verdict.severity !== "ok";

  // 탭 구성 — 라이브 게이지는 탭 밖(헤더 근처)으로 승격.
  //  · Anomalies = 이 디바이스의 이상 내역 (활성 신호 + warn/crit 이력) — 이상 있으면 초기 탭
  //  · Workloads = Pods + Processes (이 GPU를 누가 쓰나)
  //  · Profiling = CUDA · Memory · Bandwidth (디바이스 내부 심층, Run:ai "profiling" 관례)
  //  · Events · Agent
  const podCount = new Set(view.processes.map((p) => p.pod)).size;
  const activeAnomalies = gpuActiveAnomalies(view);
  const anomalyEvents = view.events.filter((e) => e.severity !== "info");
  const anomalyCount = activeAnomalies.length + anomalyEvents.length;
  const subtabs: TabDef[] = [
    {
      id: "anomalies",
      label: "Anomalies",
      badge: anomalyCount || undefined,
      alert: activeAnomalies.some((a) => a.severity === "crit") || anomalyEvents.some((e) => e.severity === "crit"),
      content: <GpuAnomaliesPanel view={view} />,
    },
    {
      id: "workloads",
      label: "Workloads",
      badge: podCount || undefined,
      content: (
        <div className="space-y-6">
          <GpuPodsPanel view={view} perPodAvailable={perPodAvailable} node={node} />
          <GpuSection title="프로세스 (PID별)" hint="이 GPU에서 실행 중인 GPU 프로세스">
            <GpuProcessesPanel processes={view.processes} perPodAvailable={perPodAvailable} node={node} />
          </GpuSection>
        </div>
      ),
    },
    {
      id: "profiling",
      label: "Profiling",
      content: (
        <div className="space-y-6">
          <GpuSection title="CUDA 활동" hint="커널·복사·동기화 런치">
            <CudaActivityPanel cudaActivity={view.cudaActivity} />
          </GpuSection>
          <GpuSection title="메모리" hint="framebuffer 사용 추이">
            <GpuMemoryPanel memSeries={view.memSeries} />
          </GpuSection>
          <GpuSection title="인터커넥트" hint="PCIe · NVLink 대역폭">
            <GpuInterconnectPanel ic={view.interconnect} />
          </GpuSection>
        </div>
      ),
    },
    {
      id: "events",
      label: "Events",
      badge: view.events.length || undefined,
      content: <GpuEventsPanel events={view.events} />,
    },
    {
      id: "agent",
      label: "Agent",
      content: <GpuAgentPanel agent={agent} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* 결론 — 이 디바이스에 문제가 있을 때만 */}
      {showVerdict && <GpuVerdictBanner node={node} vd={view.verdict} />}
      {/* 실시간 텔레메트리 — 헤더 근처 항상 표시 (util·mem·temp·power 게이지) */}
      <GpuLivePanel device={view.device} series={view.series} />
      <section>
        <SectionTitle>상세 분석</SectionTitle>
        {/* 활성 이상이 있으면 Anomalies 를 초기 탭으로 — 이력만 있을 땐 배지로만 알림 */}
        <Tabs tabs={subtabs} initial={activeAnomalies.length ? "anomalies" : "workloads"} />
      </section>
    </div>
  );
}

// ── GPU 디바이스 목록 — 비교가 쉬운 테이블에서 디바이스 전용 페이지로 드릴다운 ────
const GPU_SEV_DOT: Record<Severity | "ok", string> = { ok: "#5bb85b", warn: "#e8923b", crit: "#dc4a3d" };
function GpuDeviceList({ views, node }: { views: GpuDeviceView[]; node: string }) {
  if (!views.length) return <p className="text-[12px] text-slate-500">GPU 디바이스 없음</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12px] whitespace-nowrap">
        <thead>
          <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-3">device</th>
            <th className="pr-3 text-right">SM</th>
            <th className="pr-3 text-right">VRAM</th>
            <th className="pr-3 text-right">temp</th>
            <th className="pr-3 text-right">power</th>
            <th className="text-right">판정</th>
          </tr>
        </thead>
        <tbody>
          {views.map((v) => {
            const d = v.device;
            const smPct = Math.round(d.util * 100);
            const memPct = Math.round((d.memUsedMB / d.memTotalMB) * 100);
            // util은 "낮을수록 이상"(idle) — 정상 초록 / 이상 빨강
            const utilColor = d.util < 0.2 ? "#dc4a3d" : d.util < 0.4 ? "#e8923b" : "#5bb85b";
            const memTone = memPct >= 85 ? "text-rose-600" : memPct >= 70 ? "text-amber-600" : "text-slate-500";
            const tempTone = d.tempC >= d.tempSlowdownC ? "text-rose-600" : d.tempC >= d.tempMaxC - 6 ? "text-amber-600" : "text-slate-500";
            const verdictTone =
              v.verdict.severity === "crit"
                ? "text-rose-600"
                : v.verdict.severity === "warn"
                  ? "text-amber-600"
                  : "text-slate-500";
            return (
              <tr key={d.name} className="border-t border-slate-100">
                <td className="py-1.5 pr-3 align-top">
                  <Link
                    href={`/clusters/${node}/gpu/${d.index}`}
                    className="inline-flex items-center gap-2 font-mono font-semibold text-slate-800 underline-offset-2 hover:text-violet-700 hover:underline"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: GPU_SEV_DOT[v.verdict.severity] }} />
                    GPU {d.index}
                  </Link>
                </td>
                <td className="pr-3 text-right align-top font-mono font-semibold" style={{ color: utilColor }}>{smPct}%</td>
                <td className={`pr-3 text-right align-top font-mono ${memTone}`}>{memPct}%</td>
                <td className={`pr-3 text-right align-top font-mono ${tempTone}`}>{d.tempC}°C</td>
                <td className="pr-3 text-right align-top font-mono text-slate-500">{d.powerW}W</td>
                <td className={`text-right align-top font-mono font-semibold ${verdictTone}`}>{v.verdict.modeLabel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function GpuDashboard({ gpu, node, verdict }: { gpu: GpuInfo; node: string; verdict: GpuVerdict }) {
  // 에이전트 다운 → 디바이스 텔레메트리 수집 불가. 결론(관측불가) + self-health 만.
  if (gpu.views.length === 0) {
    return (
      <div className="space-y-6">
        <GpuVerdictBanner node={node} vd={verdict} />
        <GpuSection title="Agent self-health" hint="gpuobs-agent">
          <GpuAgentPanel agent={gpu.agent} />
        </GpuSection>
      </div>
    );
  }

  // 디바이스 목록 → 테이블에서 비교 후 디바이스 전용 페이지로 이동
  return <GpuDeviceList views={gpu.views} node={node} />;
}

// ── GPU 카드 그리드 (노드 "GPUs" 탭의 메인 화면) ────────────────────────────────
// 노드를 GPU rack 으로 보고 디바이스를 카드로 한눈에 비교. 카드 클릭 → GPU Detail.
// util 은 "낮을수록 이상"(idle) — 막대 색은 활용도, 상태 점/라벨은 verdict(throttle/idle 포함).
function gpuUtilColor(util: number) {
  return util < 0.2 ? "#dc4a3d" : util < 0.4 ? "#e8923b" : "#5bb85b";
}

function GpuCard({ view, node, idx = 0 }: { view: GpuDeviceView; node: string; idx?: number }) {
  const d = view.device;
  const sev = view.verdict.severity;
  const smPct = Math.round(d.util * 100);
  const utilColor = gpuUtilColor(d.util);
  const ring = sev === "crit" ? "border-rose-200" : sev === "warn" ? "border-amber-200" : "border-slate-200";
  const tempTone = d.tempC >= d.tempSlowdownC ? "text-rose-600" : d.tempC >= d.tempMaxC - 6 ? "text-amber-600" : "text-slate-500";
  return (
    <Link
      href={`/clusters/${node}/gpu/${d.index}`}
      className={`anim-rise group block rounded-xl border ${ring} bg-white p-3 transition-colors hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50/30`}
      style={{ animationDelay: `${Math.min(idx, 12) * 50}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[13px] font-bold text-slate-800">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GPU_SEV_DOT[sev] }} />
          GPU {d.index}
        </span>
        <span className="font-mono text-[10px] font-semibold text-slate-500">{view.verdict.modeLabel}</span>
      </div>

      {/* SM util — 막대 + 큰 수치 */}
      <div className="mt-2.5 flex items-baseline justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">SM util</span>
        <span className="font-mono text-xl font-bold" style={{ color: utilColor }}>{smPct}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="anim-growx h-full rounded-full" style={{ width: `${smPct}%`, backgroundColor: utilColor, transformOrigin: "left center", animationDelay: `${Math.min(idx, 12) * 50 + 120}ms` }} />
      </div>

      {/* 스펙 — VRAM · 온도 · 전력 */}
      <div className="mt-2.5 flex items-center justify-between font-mono text-[11px] text-slate-500">
        <span>
          {(d.memUsedMB / 1024).toFixed(0)}
          <span className="text-slate-300"> / {(d.memTotalMB / 1024).toFixed(0)}GB</span>
        </span>
        <span className={tempTone}>{d.tempC}°C</span>
        <span>{d.powerW}W</span>
      </div>
    </Link>
  );
}

export function GpuCardGrid({ views, node }: { views: GpuDeviceView[]; node: string }) {
  if (!views.length) return <p className="text-[12px] text-slate-500">GPU 디바이스 없음 — agent down 으로 디바이스 텔레메트리 수집 불가</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {views.map((v, i) => (
          <GpuCard key={v.device.name} view={v} node={node} idx={i} />
        ))}
      </div>
      <p className="text-[10px] text-slate-500">카드 클릭 → GPU Detail (eBPF 심층 분석: CUDA·Kernel·Memory·Bandwidth).</p>
    </div>
  );
}

// ── GPU별 사용 파드 (노드 "Pods" 탭) — "이 노드 GPU들에 어떤 파드가 올라가 있나" ──
// 디바이스마다 귀속된 파드를 VRAM 순으로. cuda* 미부착 노드는 귀속 불가(No data).
export function GpuPodsByDevice({ gpu, node }: { gpu: GpuInfo; node: string }) {
  if (!gpu.perPodAvailable) {
    return <AttributionBlind title="GPU별 파드 귀속 수집 불가" items={["GPU별 사용 파드", "파드별 GPU 메모리", "SM 점유"]} />;
  }
  return (
    <div className="space-y-3">
      {gpu.views.map((v) => {
        const byPod = new Map<string, { mem: number; sm: number }>();
        for (const p of v.processes) {
          const e = byPod.get(p.pod) ?? { mem: 0, sm: 0 };
          e.mem += p.memMB;
          e.sm += p.smUtil;
          byPod.set(p.pod, e);
        }
        const rows = [...byPod.entries()].map(([pod, e]) => ({ pod, ...e })).sort((a, b) => b.mem - a.mem);
        return (
          <div key={v.device.name} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Link
                href={`/clusters/${node}/gpu/${v.device.index}`}
                className="flex items-center gap-1.5 underline-offset-2 hover:underline"
              >
                <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-violet-700">GPU {v.device.index}</span>
              </Link>
              <span className="font-mono text-[11px] text-slate-500">
                {rows.length} pods · {(v.device.memUsedMB / 1024).toFixed(0)}GB
              </span>
            </div>
            {rows.length ? (
              <ul className="space-y-1">
                {rows.map((r) => (
                  <li key={r.pod} className="flex items-center justify-between text-[12px]">
                    <Link href={`/clusters/${node}/${r.pod}`} className="font-mono text-slate-600 underline-offset-2 hover:text-sky-600 hover:underline">
                      {r.pod}
                    </Link>
                    <span className="flex items-center gap-3 font-mono text-slate-500">
                      <span>SM {Math.round(r.sm * 100)}%</span>
                      <span className="font-semibold text-slate-700">{(r.mem / 1024).toFixed(1)}GB</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-500">유휴 — 사용 중인 파드 없음</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 워크로드별 Top drop reasons 테이블 ───────────────────────────────────────
export function DropReasonsTable({ rows }: { rows: DropReasonRow[] }) {
  if (!rows.length) return <EmptyState message="드롭 이벤트 없음" />;
  const catTone: Record<string, string> = {
    policy: "bg-rose-100 text-rose-700",
    queue: "bg-amber-100 text-amber-700",
    unknown: "bg-slate-100 text-slate-600",
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-3">drop_reason</th>
            <th className="pr-3">category</th>
            <th className="pr-3">namespace</th>
            <th className="pr-3">workload</th>
            <th className="text-right">rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
              <td className="py-1.5 pr-3 font-mono font-semibold text-slate-700">{r.reason}</td>
              <td className="pr-3">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${catTone[r.category] ?? catTone.unknown}`}>
                  {r.category}
                </span>
              </td>
              <td className="pr-3 font-mono text-slate-500">{r.namespace}</td>
              <td className="pr-3 truncate font-mono text-slate-600" title={r.workload}>{r.workload}</td>
              <td className="text-right font-mono font-semibold text-slate-800">{r.rate}/s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── netobs-agent self-health 대시보드 (네트워크 eBPF agent) ───────────────────
export function NetobsDashboard({ agent }: { agent: NetobsAgentHealth }) {
  // 에이전트 다운 → 모든 BPF 프로그램 detach, 텔레메트리 수집 중단
  if (!agent.up) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
        <span className="h-2 w-2 rounded-full bg-rose-500" />
        netobs-agent DOWN — 노드 NotReady로 BPF 프로그램이 모두 detach되어 네트워크 텔레메트리 수집이 중단되었습니다.
      </div>
    );
  }

  const ringbufTone = agent.ringbufDropRate > 5 ? "text-rose-600" : agent.ringbufDropRate > 1 ? "text-amber-600" : "text-emerald-600";
  const activeRetries = agent.retryPressure.filter((r) => r.rate > 0);

  return (
    <div className="space-y-6">
      {/* up + informer lag + ringbuf drop */}
      <GpuSection title="Agent 상태" hint="netobs-agent">
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${agent.up ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span className="font-semibold text-slate-600">Agent {agent.up ? "up" : "down"}</span>
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-500">
            Informer sync lag <span className="font-mono font-semibold text-slate-700">{agent.informerSyncLagS}s</span>
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-500">
            Ringbuf drop <span className={`font-mono font-semibold ${ringbufTone}`}>{agent.ringbufDropRate}/s</span>
          </span>
        </div>
      </GpuSection>

      {/* BPF program attach status */}
      <GpuSection title="BPF program attach status">
        <p className="mb-1.5 text-[11px] font-medium text-slate-500">
          <span className="font-mono text-emerald-600">{agent.attachedCount} attached</span>
          {agent.failedCount > 0 ? <span className="ml-1.5 font-mono text-rose-600">{agent.failedCount} failed</span> : null}
        </p>
        <div className="flex flex-wrap gap-1">
          {agent.programs.map((p) => (
            <span
              key={p.name}
              title={p.attached ? "attached" : "failed"}
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                p.attached ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 font-semibold text-rose-700 line-through decoration-rose-300"
              }`}
            >
              {p.name}
            </span>
          ))}
        </div>
      </GpuSection>

      {/* BPF map utilization + attach result/retry */}
      <div className="grid gap-6 sm:grid-cols-2">
        <GpuSection title="BPF map utilization">
          <ScoreBars items={agent.maps.map((m) => ({ label: m.name, value: m.utilPct }))} kind="rate" unit="%" />
        </GpuSection>
        <GpuSection title="Attach result · retry pressure" hint="#105">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-[12px]">
              <span className="text-slate-500">
                success <span className="font-mono font-semibold text-emerald-600">{agent.attachResult.success}/s</span>
              </span>
              <span className="text-slate-500">
                failure <span className="font-mono font-semibold text-rose-600">{agent.attachResult.failure}/s</span>
              </span>
            </div>
            {activeRetries.length > 0 ? (
              <ul className="space-y-1.5">
                {activeRetries.map((r) => (
                  <li key={r.reason} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate font-mono text-slate-600" title={r.reason}>{r.reason}</span>
                    <span className="shrink-0 font-mono font-semibold text-amber-600">{r.rate}/s</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-emerald-600">재시도 압력 없음 (모든 reason 0/s)</p>
            )}
          </div>
        </GpuSection>
      </div>
    </div>
  );
}

// ── ip_version 별 flow bytes / drop events ───────────────────────────────────
export function NetFlowPanel({ flow }: { flow: NetFlow }) {
  const fmt = (b: number) => (b >= 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB/s` : `${(b / 1000).toFixed(1)} kB/s`);
  const total = flow.ipv4Bytes + flow.ipv6Bytes || 1;
  const v4Pct = Math.round((flow.ipv4Bytes / total) * 100);
  if (!flow.allowNamespaces) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <span className="rounded bg-slate-200 px-1 py-px text-[9px] font-bold uppercase text-slate-500">No data</span>
        NETOBS_FLOW_ALLOW_NAMESPACES 미설정 — ip_version 별 flow 집계 비활성
      </p>
    );
  }
  return (
    <div className="space-y-3 text-[12px]">
      {/* IPv4/IPv6 stacked bar */}
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-slate-500">
          <span>flow bytes (IPv4 / IPv6)</span>
          <span className="font-mono text-slate-600">{fmt(total)}</span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded bg-slate-100">
          <span className="anim-growx h-full bg-sky-500" style={{ width: `${v4Pct}%`, transformOrigin: "left center" }} title={`IPv4 ${fmt(flow.ipv4Bytes)}`} />
          <span className="anim-growx h-full bg-indigo-500" style={{ width: `${100 - v4Pct}%`, transformOrigin: "left center", animationDelay: "90ms" }} title={`IPv6 ${fmt(flow.ipv6Bytes)}`} />
        </div>
        <div className="mt-1 flex gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sky-500" />IPv4 {fmt(flow.ipv4Bytes)}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-indigo-500" />IPv6 {fmt(flow.ipv6Bytes)}</span>
        </div>
      </div>
      {/* drop events by ip_version */}
      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
        <div>
          <p className="text-[11px] text-slate-500">IPv4 drop</p>
          <p className="font-mono font-semibold text-slate-700">{flow.ipv4DropRate}/s</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-500">IPv6 drop</p>
          <p className="font-mono font-semibold text-slate-700">{flow.ipv6DropRate}/s</p>
        </div>
      </div>
    </div>
  );
}

