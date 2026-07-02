"use client";

// ───────────────────────────────────────────────────────────────────────────
// GPU 라이브 텔레메트리 (클라이언트) — 서버 스냅샷으로 초기 렌더 후 주기적으로 틱 갱신.
// SSR 하이드레이션 안정: 초기 state = 서버 props 그대로, 난수는 마운트 후에만 사용.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useState } from "react";

import { clamp, type GpuDevice, type GpuSeries, rampColor } from "./cluster";
import { Counter } from "./live";

const TICK_MS = 1000;

// ── 라이브 틱: util 평균회귀 랜덤워크 → temp·power·clock 동조 파생 (서버 공식과 동일 형태) ──
function tickDevice(base: GpuDevice, prev: GpuDevice): GpuDevice {
  const noise = (Math.random() - 0.5) * 0.06;
  const util = clamp(prev.util + (base.util - prev.util) * 0.25 + noise, 0.01, 0.98);
  const tempC = Math.round(clamp(34 + util * 50 + (Math.random() - 0.5) * 3, 30, 97));
  const powerW = Math.round(clamp(28 + util * 290 + (Math.random() - 0.5) * 12, 22, base.powerLimitW));
  const idle = util < 0.2;
  const graphicsClockMHz = idle
    ? 200 + Math.round(Math.random() * 50)
    : Math.round(clamp(1500 + util * 420 + (Math.random() - 0.5) * 40, 180, 2000));
  const hwThermalSlowdown = tempC >= base.tempSlowdownC;
  const throttleReasons: string[] = [];
  if (idle) throttleReasons.push("gpu_idle");
  if (hwThermalSlowdown) throttleReasons.push("hw_thermal_slowdown");
  if (powerW >= base.powerLimitW - 8) throttleReasons.push("sw_power_cap");
  if (throttleReasons.length === 0) throttleReasons.push("none");
  return {
    ...base,
    util: Math.round(util * 100) / 100,
    memUsedMB: Math.round(base.memTotalMB * (0.06 + util * 0.5)),
    tempC,
    powerW,
    graphicsClockMHz,
    hwThermalSlowdown,
    throttleReasons,
  };
}

function pushSeries(prev: GpuSeries, d: GpuDevice): GpuSeries {
  const roll = (arr: number[], v: number) => [...arr.slice(1), v];
  return {
    temp: roll(prev.temp, d.tempC),
    power: roll(prev.power, d.powerW),
    clock: roll(prev.clock, d.graphicsClockMHz),
    thermalSlowdown: roll(prev.thermalSlowdown, d.hwThermalSlowdown ? 1 : 0),
  };
}

// ── 프레젠테이션 (charts.tsx의 게이지/스파크라인과 동일 — 클라이언트 번들용) ──

function Gauge({
  label,
  value,
  valueText,
  max,
  color,
  markers = [],
}: {
  label: string;
  value: number;
  valueText: string;
  max: number;
  color: string;
  markers?: { at: number; label: string }[];
}) {
  const pct = clamp((value / max) * 100, 0, 100);
  return (
    <div className="text-[12px]">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-slate-500">{label}</span>
        <span className="font-mono font-semibold text-slate-700">{valueText}</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded bg-slate-100">
        <span
          className="absolute inset-y-0 left-0 rounded transition-[width,background-color] duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
        {markers.map((m) => (
          <span
            key={m.label}
            className="absolute inset-y-0 w-0.5 bg-slate-500/70"
            style={{ left: `${clamp((m.at / max) * 100, 0, 100)}%` }}
            title={`${m.label}: ${m.at}`}
          />
        ))}
      </div>
      {markers.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
          {markers.map((m) => (
            <span key={m.label} className="font-mono">
              {m.label} {m.at}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Sparkline({ lines, bands }: { lines: { values: number[]; color: string }[]; bands?: number[] }) {
  const W = 100;
  const H = 36;
  const pad = 3;
  const uid = useId().replace(/:/g, "");
  const n = Math.max(...lines.map((l) => l.values.length), 1);
  if (n <= 1) return <p className="text-[12px] text-slate-500">데이터 없음</p>;
  const x = (i: number) => (i / (n - 1)) * W;
  const norm = (vals: number[]) => {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    return vals.map((v) => H - pad - ((v - min) / span) * (H - pad * 2));
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-9 w-full">
      <defs>
        {lines.map((l, li) => (
          <linearGradient key={li} id={`spk-${uid}-${li}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={l.color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={l.color} stopOpacity={0.02} />
          </linearGradient>
        ))}
      </defs>
      {bands?.map((b, i) =>
        b ? <rect key={i} x={x(i) - W / n / 2} y={0} width={W / n} height={H} fill="#fecaca" opacity={0.55} /> : null,
      )}
      {lines.map((l, li) => {
        const ys = norm(l.values);
        const pts = l.values.map((_, i) => `${x(i)},${ys[i]}`).join(" ");
        const last = l.values.length - 1;
        return (
          <g key={li}>
            <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#spk-${uid}-${li})`} />
            <polyline points={pts} fill="none" stroke={l.color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <circle cx={x(last)} cy={ys[last]} r={1.6} fill={l.color} />
          </g>
        );
      })}
    </svg>
  );
}

function LegendDot({ color, label }: { color: string; label: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-slate-500">
      <span className="h-1.5 w-3 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
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

export function GpuLivePanel({ device, series }: { device: GpuDevice; series: GpuSeries }) {
  // 단일 state — 초기값 = 서버 스냅샷(SSR과 동일), live=false. 틱은 interval 콜백에서만.
  const [{ d, s, live }, setState] = useState({ d: device, s: series, live: false });

  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => {
        const nextD = tickDevice(device, prev.d);
        return { d: nextD, s: pushSeries(prev.s, nextD), live: true };
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [device]);

  const memPct = Math.round((d.memUsedMB / d.memTotalMB) * 100);
  const fmtGB = (mb: number) => `${(mb / 1024).toFixed(1)}GB`;
  // util은 "낮을수록 이상"(idle) — 정상 초록 / 이상 빨강으로 반전
  const utilColor = d.util < 0.2 ? "#dc4a3d" : d.util < 0.4 ? "#e8923b" : "#5bb85b";

  return (
    <div className="space-y-6">
      {/* 디바이스 헤더 + LIVE 인디케이터 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-violet-100 px-2 py-0.5 text-[12px] font-bold text-violet-700">{d.name}</span>
        <span className="text-[12px] text-slate-500">{d.model}</span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-emerald-500" : "bg-slate-300"}`} />
          {live ? "Live · 1s" : "—"}
        </span>
      </div>

      {/* 디바이스 텔레메트리 게이지 */}
      <Section title="디바이스 텔레메트리" hint="DCGM / NVML">
        <div className="grid gap-4 sm:grid-cols-2">
          <Gauge label="GPU utilization (SM active)" value={d.util * 100} valueText={`${Math.round(d.util * 100)}%`} max={100} color={utilColor} />
          <Gauge
            label="GPU memory used"
            value={d.memUsedMB}
            valueText={`${fmtGB(d.memUsedMB)} / ${fmtGB(d.memTotalMB)} (${memPct}%)`}
            max={d.memTotalMB}
            color={rampColor(memPct)}
          />
          <Gauge
            label="Temperature"
            value={d.tempC}
            valueText={`${d.tempC}°C`}
            max={d.tempShutdownC}
            color={rampColor((d.tempC / d.tempSlowdownC) * 100)}
            markers={[
              { at: d.tempMaxC, label: "max" },
              { at: d.tempSlowdownC, label: "slowdown" },
              { at: d.tempShutdownC, label: "shutdown" },
            ]}
          />
          <Gauge
            label="Power usage"
            value={d.powerW}
            valueText={`${d.powerW}W`}
            max={d.powerLimitW}
            color={rampColor((d.powerW / d.powerLimitW) * 100)}
            markers={[{ at: d.powerLimitW, label: "limit" }]}
          />
        </div>
      </Section>

      {/* Throttle active reasons */}
      <Section title="Throttle active reasons">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {d.throttleReasons.map((r) => {
            const isNone = r === "none";
            return (
              <span
                key={r}
                className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${
                  isNone ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                }`}
              >
                {r}
              </span>
            );
          })}
          <span className="ml-auto font-mono text-[10px] text-slate-500">
            graphics clock <Counter value={d.graphicsClockMHz} suffix="MHz" />
          </span>
        </div>
      </Section>

      {/* 교차 분석 (#68): thermal × power, clock × thermal throttle (이중축 스파크라인, 스크롤) */}
      <Section title="교차 분석" hint="#68 · 실시간 추세">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-100 p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[11px] font-medium text-slate-500">Thermal × Power</p>
              <div className="flex gap-2">
                <LegendDot color="#f97316" label={<Counter value={d.tempC} suffix="°C" />} />
                <LegendDot color="#8b5cf6" label={<Counter value={d.powerW} suffix="W" />} />
              </div>
            </div>
            <Sparkline
              lines={[
                { values: s.temp, color: "#f97316" },
                { values: s.power, color: "#8b5cf6" },
              ]}
            />
            <p className="mt-1 text-[10px] text-slate-500">온도·전력 동조 — 함께 오르면 열·전력 부하 동반</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[11px] font-medium text-slate-500">Clock × Thermal throttle</p>
              <div className="flex gap-2">
                <LegendDot color="#6366f1" label={<Counter value={d.graphicsClockMHz} suffix="MHz" />} />
                <LegendDot color="#fecaca" label="slowdown" />
              </div>
            </div>
            <Sparkline lines={[{ values: s.clock, color: "#6366f1" }]} bands={s.thermalSlowdown} />
            <p className="mt-1 text-[10px] text-slate-500">
              {d.hwThermalSlowdown ? "음영 구간에서 클럭 강제 하향(열 슬로다운)" : "슬로다운 비활성 — 클럭 안정"}
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
