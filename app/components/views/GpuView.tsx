"use client";

import { useMemo, useState } from "react";
import {
  GPU_STATES,
  type GpuData,
  type GpuDevice,
  lastV,
  pearson,
} from "../../lib/telemetry";
import Gauge from "../charts/Gauge";
import StackedArea from "../charts/StackedArea";
import ScatterPlot from "../charts/ScatterPlot";
import LineChart from "../charts/LineChart";

function tempColor(t: number) {
  return t >= 80 ? "#f43f5e" : t >= 65 ? "#fbbf24" : "#34d399";
}

export default function GpuView({ data }: { data: GpuData }) {
  const [selectedId, setSelectedId] = useState(data.devices[0]?.id ?? "");
  const selected = data.devices.find((d) => d.id === selectedId) ?? data.devices[0];

  const avgUtil = useMemo(
    () => data.devices.reduce((s, d) => s + lastV(d.util), 0) / Math.max(1, data.devices.length),
    [data],
  );

  // dominant idle cause across the fleet (last sample)
  const dominantCause = useMemo(() => {
    let pcie = 0;
    let net = 0;
    let idle = 0;
    for (const d of data.devices) {
      const b = d.breakdown[d.breakdown.length - 1]?.stages;
      if (!b) continue;
      pcie += b.pcieWait;
      net += b.netWait;
      idle += b.idle;
    }
    const entries: [string, number][] = [
      ["PCIe wait", pcie],
      ["TCP/net wait", net],
      ["Idle", idle],
    ];
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }, [data]);

  return (
    <div className="px-6 py-6">
      <header className="mb-5">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Phase 1 · 기능 6</div>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-50">GPU 통합 간섭 분석</h1>
        <p className="mt-1 text-sm text-zinc-500">
          GPU가 노는 이유(PCIe 점유 vs TCP 재전송)를 규명 — 하드웨어 병목과 네트워크 지연을 결합 분석
        </p>
      </header>

      {/* KPI */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="GPU 수" value={`${data.devices.length}`} sub="A100 · 2 nodes" accent="#38bdf8" />
        <Kpi label="평균 사용률" value={`${avgUtil.toFixed(0)}%`} sub="fleet util" accent="#34d399" />
        <Kpi label="평균 유휴" value={`${(100 - avgUtil).toFixed(0)}%`} sub="100 − util" accent="#fbbf24" />
        <Kpi label="주요 유휴 원인" value={dominantCause} sub="fleet 기준" accent="#f43f5e" />
      </div>

      {/* device cards */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.devices.map((d) => (
          <GpuCard key={d.id} device={d} selected={d.id === selectedId} onSelect={() => setSelectedId(d.id)} />
        ))}
      </div>

      {selected && (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* idle cause breakdown */}
            <Panel
              title={`GPU 시간 분해 — ${selected.node} #${selected.index}`}
              hint="왜 노는가"
              legend={GPU_STATES}
            >
              <StackedArea data={selected.breakdown} stages={GPU_STATES} valueFormat={(v) => `${v.toFixed(0)}%`} />
            </Panel>

            {/* PCIe vs TCP scatter */}
            <ScatterPanel device={selected} />
          </div>

          {/* integrated timeline */}
          <Panel className="mt-4" title="통합 타임라인 — GPU 사용률 · PCIe 점유 · TCP 재전송" hint="TCP 재전송은 상대값(%)으로 정규화">
            <IntegratedTimeline device={selected} />
          </Panel>
        </>
      )}
    </div>
  );
}

function GpuCard({ device, selected, onSelect }: { device: GpuDevice; selected: boolean; onSelect: () => void }) {
  const util = lastV(device.util);
  const mem = lastV(device.mem);
  const temp = lastV(device.temp);
  const power = lastV(device.power);

  return (
    <button
      onClick={onSelect}
      className={`rounded-2xl border p-3 text-left transition ${
        selected ? "border-zinc-400 bg-zinc-800/50" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600"
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-100">{device.node.split(".")[0]} #{device.index}</span>
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">A100</span>
      </div>
      <div className="mb-2 truncate font-mono text-[10px] text-zinc-600">{device.uuid}</div>
      <div className="grid grid-cols-2 gap-1">
        <Gauge value={util} max={100} label="Util" display={`${util.toFixed(0)}%`} color="#34d399" size={104} />
        <Gauge value={mem} max={device.memTotalMi} label="Memory" display={`${(mem / 1024).toFixed(0)}G`} color="#38bdf8" size={104} />
        <Gauge value={temp} max={100} label="Temp" display={`${temp.toFixed(0)}°`} color={tempColor(temp)} size={104} />
        <Gauge value={power} max={device.powerLimitW} label="Power" display={`${power.toFixed(0)}W`} color="#a78bfa" size={104} />
      </div>
    </button>
  );
}

function ScatterPanel({ device }: { device: GpuDevice }) {
  const r = pearson(device.pcie.map((p) => p.v), device.tcpRetrans.map((p) => p.v));
  const points = device.pcie.map((p, i) => ({
    x: p.v,
    y: device.tcpRetrans[i]?.v ?? 0,
    c: (device.util[i]?.v ?? 0) / 100,
    title: `PCIe ${p.v.toFixed(0)}% · TCP retr ${(device.tcpRetrans[i]?.v ?? 0).toFixed(0)}/s · util ${(device.util[i]?.v ?? 0).toFixed(0)}%`,
  }));

  const interp =
    Math.abs(r) < 0.3
      ? "두 원인이 독립적 — 단일 병목"
      : r > 0
        ? "PCIe·TCP 동반 상승 — 복합 병목"
        : "상호 보완적 병목";

  return (
    <Panel
      title="PCIe 점유 vs TCP 재전송"
      hint={`점 색 = GPU util`}
    >
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="rounded bg-zinc-800 px-2 py-0.5 font-medium text-zinc-200">Pearson r = {r.toFixed(2)}</span>
        <span className="text-zinc-500">{interp}</span>
      </div>
      <ScatterPlot
        points={points}
        xLabel="PCIe occupancy (%)"
        yLabel="TCP retransmits / s"
        xFormat={(v) => `${v.toFixed(0)}`}
        yFormat={(v) => `${v.toFixed(0)}`}
      />
    </Panel>
  );
}

function IntegratedTimeline({ device }: { device: GpuDevice }) {
  const retrMax = Math.max(1, ...device.tcpRetrans.map((p) => p.v));
  const series = [
    { key: "util", label: "GPU util (%)", color: "#34d399", points: device.util },
    { key: "pcie", label: "PCIe 점유 (%)", color: "#fbbf24", points: device.pcie },
    {
      key: "retr",
      label: "TCP 재전송 (rel %)",
      color: "#f43f5e",
      points: device.tcpRetrans.map((p) => ({ t: p.t, v: (p.v / retrMax) * 100 })),
    },
  ];
  return <LineChart series={series} valueFormat={(v) => v.toFixed(0)} />;
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
