"use client";

// ───────────────────────────────────────────────────────────────────────────
// GPU 패브릭 토폴로지 (클라이언트 섬) — DGX/HGX 베이스보드 관점 + nvidia-smi topo -m.
//   · Diagram : GPU를 하드웨어 타일로 배치, NVSwitch 패브릭(8) / NVLink 메시(4) / 브리지(2).
//               두께·색 = 대역폭 점유, hot 링크는 흐름 애니메이션, hover → 경로 하이라이트.
//   · Matrix  : nvidia-smi topo -m 스타일 연결 매트릭스 (NV#/PHB/PIX/SYS + 대역폭 히트).
// 값은 서버 스냅샷(결정적) — SSR 하이드레이션 안정. 모션은 CSS(globals.css)만.
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { type ReactNode, useState } from "react";

import { clamp, type FabricGpu, type FabricKind, type GpuFabric, rampColor, type Severity } from "./cluster";

// GPU는 "낮을수록 이상"(idle) — idle 빨강 / 저활용 주황 / 정상 초록 (charts.tsx gpuUtilColor와 동일)
function utilColor(u: number) {
  return u < 0.2 ? "#dc4a3d" : u < 0.4 ? "#e8923b" : "#5bb85b";
}
const SEV_DOT: Record<Severity | "ok", string> = { ok: "#5bb85b", warn: "#e8923b", crit: "#dc4a3d" };
const SEV_ACCENT: Record<Severity | "ok", string> = { ok: "#10b981", warn: "#f0a93b", crit: "#e0473a" };

const KIND_LABEL: Record<FabricKind, string> = {
  nvswitch: "NVSwitch 패브릭",
  mesh: "NVLink 풀메시",
  pair: "NVLink 브리지",
};

const gb = (v: number) => (v >= 100 ? Math.round(v).toString() : v.toFixed(1));
const rgba = (rgb: string, a: number) => rgb.replace("rgb(", "rgba(").replace(")", `, ${a})`);

// ── 레이아웃 (% 좌표) — kind별 결정적 배치 ────────────────────────────────────
type Pt = { x: number; y: number };
type Layout = {
  gpu: Pt[];
  spine?: { y: number; w: number }; // NVSwitch 스파인 (가로 바)
  hostAnchor: Pt; // 호스트 PCIe 트렁크가 GPU 복합체에 붙는 점
  cpu: Pt;
  nic: Pt;
  h: number; // 스테이지 높이(px)
  minW: number; // 가로 스크롤 최소폭(px)
};

function layoutFor(kind: FabricKind, n: number): Layout {
  if (kind === "nvswitch") {
    const xs = [14, 38, 62, 86];
    const topY = 13, botY = 62, spineY = 38;
    const gpu: Pt[] = [];
    for (let i = 0; i < n; i++) gpu.push({ x: xs[i % 4], y: i < 4 ? topY : botY });
    return { gpu, spine: { y: spineY, w: 84 }, hostAnchor: { x: 50, y: spineY }, cpu: { x: 42, y: 90 }, nic: { x: 66, y: 90 }, h: 520, minW: 700 };
  }
  if (kind === "mesh") {
    const xs = [30, 70], topY = 24, botY = 60;
    const gpu: Pt[] = [
      { x: xs[0], y: topY }, { x: xs[1], y: topY },
      { x: xs[0], y: botY }, { x: xs[1], y: botY },
    ];
    return { gpu, hostAnchor: { x: 50, y: botY }, cpu: { x: 42, y: 90 }, nic: { x: 66, y: 90 }, h: 440, minW: 560 };
  }
  // pair
  return {
    gpu: [{ x: 30, y: 34 }, { x: 70, y: 34 }],
    hostAnchor: { x: 50, y: 52 },
    cpu: { x: 42, y: 84 },
    nic: { x: 66, y: 84 },
    h: 360,
    minW: 480,
  };
}

// ── SVG 링크 (파이프 + 흐름) ──────────────────────────────────────────────────
function Edge({
  a, b, ratio, dashed, state,
}: {
  a: Pt; b: Pt; ratio: number; dashed?: boolean; state: "active" | "dim" | "normal";
}) {
  const idle = ratio < 0.04;
  const groupOpacity = state === "dim" ? 0.12 : 1;
  if (idle) {
    return (
      <line
        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke="#e2e8f0" strokeWidth={1} strokeDasharray={dashed ? "4 3" : undefined}
        vectorEffect="non-scaling-stroke" opacity={groupOpacity}
      />
    );
  }
  const color = rampColor(ratio * 100);
  const w = (1 + ratio * 5) * (state === "active" ? 1.25 : 1);
  const dur = `${Math.max(0.6, 1.9 - ratio * 1.4).toFixed(2)}s`;
  return (
    <g opacity={groupOpacity}>
      <line
        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke={color} strokeWidth={w} strokeLinecap="round"
        strokeDasharray={dashed ? "4 3" : undefined} vectorEffect="non-scaling-stroke" opacity={0.5}
      />
      <line
        className="flow-line"
        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke={color} strokeWidth={w} strokeLinecap="round"
        strokeDasharray="1.6 9" vectorEffect="non-scaling-stroke"
        style={{ animationDuration: dur }}
      />
    </g>
  );
}

// ── 소형 호스트 노드 (CPU / NIC) ──────────────────────────────────────────────
function HostNode({ pt, tone, label, sub, dim }: { pt: Pt; tone: "cpu" | "nic"; label: string; sub: string; dim: boolean }) {
  const style = tone === "cpu"
    ? "border-slate-300 bg-slate-50 text-slate-700"
    : "border-sky-300 bg-sky-50 text-sky-700";
  return (
    <div
      className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2.5 py-1 text-center shadow-sm transition-opacity ${style}`}
      style={{ left: `${pt.x}%`, top: `${pt.y}%`, opacity: dim ? 0.4 : 1 }}
    >
      <div className="text-[11px] font-bold leading-tight">{label}</div>
      <div className="font-mono text-[9px] opacity-70">{sub}</div>
    </div>
  );
}

// ── GPU 타일 (사용자가 마음에 안 들어했던 "노드" — 리치 하드웨어 타일로 교체) ──────
function GpuTile({
  g, pt, node, idx, state, onHover,
}: {
  g: FabricGpu; pt: Pt; node: string; idx: number; state: "active" | "peer" | "dim" | "normal"; onHover: (i: number | null) => void;
}) {
  const dot = SEV_DOT[g.severity];
  const accent = SEV_ACCENT[g.severity];
  const uc = utilColor(g.util);
  const smPct = Math.round(g.util * 100);
  const memPct = clamp((g.memUsedMB / g.memTotalMB) * 100, 0, 100);
  const ring =
    state === "active" ? "ring-2 ring-violet-400" : state === "peer" ? "ring-2 ring-violet-200" : "ring-0";
  const tempTone = g.tempC >= 90 ? "text-rose-600" : g.tempC >= 78 ? "text-amber-600" : "text-slate-500";
  return (
    <Link
      href={`/clusters/${node}/gpu/${g.index}`}
      onMouseEnter={() => onHover(g.index)}
      onMouseLeave={() => onHover(null)}
      className={`surface-card anim-rise group absolute z-10 block w-36 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl ${ring} transition-[scale,box-shadow,opacity] duration-200 hover:z-20 hover:scale-[1.04] hover:shadow-lg`}
      style={{ left: `${pt.x}%`, top: `${pt.y}%`, opacity: state === "dim" ? 0.32 : 1, animationDelay: `${Math.min(idx, 12) * 55}ms` }}
    >
      {/* 상태 강조 스트립 */}
      <span className="block h-1 w-full" style={{ backgroundColor: accent }} />
      <div className="p-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-mono text-[12px] font-bold text-slate-800">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
            GPU {g.index}
          </span>
          <span className="rounded bg-slate-100 px-1 font-mono text-[8px] font-semibold uppercase tracking-wide text-slate-500">
            NUMA{g.numa}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[9px] font-medium uppercase tracking-wide text-slate-400">{g.model}</div>

        {/* SM util — 주 지표 */}
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">SM</span>
          <span className="font-mono text-[15px] font-bold leading-none" style={{ color: uc }}>{smPct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <span className="anim-growx block h-full rounded-full" style={{ width: `${smPct}%`, backgroundColor: uc, transformOrigin: "left center" }} />
        </div>

        {/* VRAM */}
        <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-slate-500">
          <span>VRAM</span>
          <span>{(g.memUsedMB / 1024).toFixed(0)}<span className="text-slate-300">/{(g.memTotalMB / 1024).toFixed(0)}GB</span></span>
        </div>
        <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <span className="block h-full rounded-full" style={{ width: `${memPct}%`, backgroundColor: rampColor(memPct) }} />
        </div>

        {/* 푸터 — 온도 · NVLink 집계 · 이상 배지 */}
        <div className="mt-2 flex items-center justify-between font-mono text-[9px]">
          <span className={tempTone}>{g.tempC}°C</span>
          {g.idle ? (
            <span className="rounded bg-rose-100 px-1 font-semibold text-rose-600">idle</span>
          ) : g.throttled ? (
            <span className="rounded bg-amber-100 px-1 font-semibold text-amber-600">throttle</span>
          ) : (
            <span className="text-slate-400">◇ {gb(g.nvlinkGbs)} GB/s</span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── 다이어그램 뷰 ─────────────────────────────────────────────────────────────
function DiagramView({ fabric, node }: { fabric: GpuFabric; node: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const { kind, gpus, links } = fabric;
  const L = layoutFor(kind, gpus.length);

  // hover 시 직접 연결된 peer 집합 (mesh/pair). nvswitch는 스위치 경유라 peer 없음.
  const peers = new Set<number>();
  if (hover !== null) for (const l of links) { if (l.a === hover) peers.add(l.b); if (l.b === hover) peers.add(l.a); }

  const tileState = (i: number): "active" | "peer" | "dim" | "normal" => {
    if (hover === null) return "normal";
    if (i === hover) return "active";
    if (peers.has(i)) return "peer";
    return "dim";
  };
  const linkState = (touches: boolean): "active" | "dim" | "normal" =>
    hover === null ? "normal" : touches ? "active" : "dim";

  // 링크 라벨 (HTML — SVG text는 preserveAspectRatio=none에서 왜곡) — hover 시에만 강조 노출
  const labels: { x: number; y: number; text: string; active: boolean }[] = [];

  const edges: ReactNode[] = [];
  if (kind === "nvswitch" && L.spine) {
    // GPU ↔ NVSwitch 스파인
    gpus.forEach((g, i) => {
      const ratio = clamp(g.nvlinkGbs / g.nvlinkMaxGbs, 0, 1);
      const gp = { x: L.gpu[i].x, y: L.gpu[i].y };
      const sp = { x: L.gpu[i].x, y: L.spine!.y };
      const touches = hover === i;
      edges.push(<Edge key={`nv-${i}`} a={gp} b={sp} ratio={ratio} state={linkState(touches)} />);
      labels.push({ x: gp.x, y: (gp.y + sp.y) / 2, text: `${gb(g.nvlinkGbs)}`, active: touches });
    });
  } else {
    // GPU ↔ GPU 직접 (mesh/pair)
    links.forEach((l, li) => {
      const ratio = clamp(l.gbs / l.maxGbs, 0, 1);
      const touches = hover === l.a || hover === l.b;
      edges.push(<Edge key={`l-${li}`} a={L.gpu[l.a]} b={L.gpu[l.b]} ratio={ratio} state={linkState(touches)} />);
      labels.push({ x: (L.gpu[l.a].x + L.gpu[l.b].x) / 2, y: (L.gpu[l.a].y + L.gpu[l.b].y) / 2, text: `${gb(l.gbs)} · NV${l.count}`, active: touches });
    });
  }
  // 호스트 PCIe 트렁크 (aggregate) + NIC
  const hostRatio = clamp(fabric.host.gbs / fabric.host.maxGbs, 0, 1);
  const nicRatio = clamp(fabric.nic.gbs / fabric.nic.maxGbs, 0, 1);
  edges.push(<Edge key="host" a={L.hostAnchor} b={L.cpu} ratio={hostRatio} dashed state={hover === null ? "normal" : "dim"} />);
  edges.push(<Edge key="nic" a={L.cpu} b={L.nic} ratio={nicRatio} dashed state={hover === null ? "normal" : "dim"} />);

  return (
    <div className="overflow-x-auto">
      <div className="relative w-full" style={{ height: L.h, minWidth: L.minW }}>
        {/* 링크 레이어 */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {edges}
        </svg>

        {/* 링크 라벨 — hover한 GPU의 링크만 노출 (충돌·잡음 방지) */}
        {labels.filter((lb) => lb.active).map((lb, i) => (
          <div
            key={i}
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-white shadow-md"
            style={{ left: `${lb.x}%`, top: `${lb.y}%` }}
          >
            {lb.text}<span className="opacity-60"> GB/s</span>
          </div>
        ))}

        {/* NVSwitch 패브릭 스파인 */}
        {kind === "nvswitch" && L.spine && (
          <div
            className="absolute z-8 -translate-x-1/2 -translate-y-1/2"
            style={{ left: "50%", top: `${L.spine.y}%`, width: `${L.spine.w}%` }}
          >
            <div className="relative overflow-hidden rounded-lg bg-violet-600 px-3 py-2 text-white shadow-md">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold tracking-wide">NVSwitch fabric</span>
                <span className="font-mono text-[10px] text-violet-100">
                  {gb(fabric.switchGbs)} <span className="opacity-70">/ {gb(fabric.switchMaxGbs)} GB/s</span>
                </span>
              </div>
              <span className="shimmer-band" />
            </div>
          </div>
        )}

        {/* 호스트 노드 */}
        <HostNode pt={L.cpu} tone="cpu" label="Host CPU" sub={`PCIe ${gb(fabric.host.gbs)} GB/s`} dim={hover !== null} />
        <HostNode pt={L.nic} tone="nic" label="NIC mlx5" sub={`${gb(fabric.nic.gbs)} GB/s`} dim={hover !== null} />

        {/* GPU 타일 — g에 좌표 주입 */}
        {gpus.map((g, i) => (
          <GpuTile key={g.index} g={g} pt={L.gpu[i]} node={node} idx={i} state={tileState(i)} onHover={setHover} />
        ))}
      </div>

      {/* 범례 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 18 4" className="h-1 w-4"><line x1="0" y1="2" x2="18" y2="2" stroke="#94a3b8" strokeWidth="2.5" /></svg>
          NVLink
        </span>
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 18 4" className="h-1 w-4"><line x1="0" y1="2" x2="18" y2="2" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
          PCIe host
        </span>
        <span className="text-slate-300">·</span>
        {(["ok", "warn", "crit"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEV_DOT[s] }} />
            {s === "ok" ? "정상" : s === "warn" ? "경고" : "심각"}
          </span>
        ))}
        <span className="ml-auto font-mono text-slate-400">두께·색 = 대역폭 점유 · GPU 클릭 → 디바이스 상세</span>
      </div>
    </div>
  );
}

// ── 매트릭스 뷰 (nvidia-smi topo -m) ──────────────────────────────────────────
function MatrixView({ fabric }: { fabric: GpuFabric }) {
  const { gpus, matrix } = fabric;
  const n = gpus.length;
  const [hr, setHr] = useState<number | null>(null);
  const [hc, setHc] = useState<number | null>(null);

  // 확장 컬럼: GPU0..n-1, CPU affinity, NIC
  const hostCol = (g: FabricGpu, forNic: boolean) =>
    forNic ? (g.numa === 0 ? "PIX" : "SYS") : g.numa === 0 ? "PHB" : "SYS";
  const HOST_TONE: Record<string, string> = {
    PHB: "bg-sky-50 text-sky-700",
    PIX: "bg-emerald-50 text-emerald-700",
    SYS: "bg-slate-100 text-slate-500",
  };

  const colHi = (c: number) => hc === c;
  const headCls = (active: boolean) =>
    `px-2 py-1.5 text-center font-mono text-[10px] font-semibold transition-colors ${active ? "bg-violet-100 text-violet-700" : "text-slate-500"}`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 3 }} onMouseLeave={() => { setHr(null); setHc(null); }}>
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left font-mono text-[10px] font-semibold text-slate-400">topo</th>
            {gpus.map((g, c) => (
              <th key={g.index} className={headCls(colHi(c))}>GPU{g.index}</th>
            ))}
            <th className={headCls(colHi(n))}>CPU</th>
            <th className={headCls(colHi(n + 1))}>NIC</th>
          </tr>
        </thead>
        <tbody>
          {gpus.map((g, r) => {
            const rowHi = hr === r;
            return (
              <tr key={g.index}>
                <th className={`px-2 py-1.5 text-left font-mono text-[10px] font-semibold transition-colors ${rowHi ? "bg-violet-100 text-violet-700" : "text-slate-500"}`}>
                  GPU{g.index}
                </th>
                {matrix[r].map((cell, c) => {
                  const cross = rowHi || colHi(c);
                  if (cell.kind === "self") {
                    return (
                      <td key={c} onMouseEnter={() => { setHr(r); setHc(c); }}
                        className="rounded text-center font-mono text-[10px] font-bold text-slate-300"
                        style={{ background: "repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 3px,#e2e8f0 3px,#e2e8f0 6px)" }}>
                        X
                      </td>
                    );
                  }
                  const heat = rampColor(cell.ratio * 100);
                  return (
                    <td
                      key={c}
                      onMouseEnter={() => { setHr(r); setHc(c); }}
                      title={`GPU${g.index}↔GPU${c} · ${cell.label} · ${gb(cell.gbs)} GB/s`}
                      className={`relative rounded text-center font-mono text-[10px] font-semibold transition-transform ${cross ? "scale-[1.06] text-slate-900" : "text-slate-600"}`}
                      style={{ backgroundColor: rgba(heat, 0.14 + cell.ratio * 0.55), outline: cross ? "1px solid rgba(124,58,237,0.5)" : "none" }}
                    >
                      <span className="relative z-10 block px-1.5 py-1.5">{cell.label}</span>
                    </td>
                  );
                })}
                {/* CPU / NIC affinity */}
                {[false, true].map((forNic) => {
                  const cls = hostCol(g, forNic);
                  const c = forNic ? n + 1 : n;
                  const cross = rowHi || colHi(c);
                  return (
                    <td key={forNic ? "nic" : "cpu"} onMouseEnter={() => { setHr(r); setHc(c); }}
                      title={`GPU${g.index} ↔ ${forNic ? "NIC" : "CPU"} · ${cls}`}
                      className={`rounded px-1.5 py-1.5 text-center font-mono text-[10px] font-semibold transition-transform ${HOST_TONE[cls]} ${cross ? "scale-[1.06]" : ""}`}
                      style={{ outline: cross ? "1px solid rgba(124,58,237,0.5)" : "none" }}>
                      {cls}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 범례 — nvidia-smi topo -m 토큰 */}
      <div className="mt-3 grid gap-1.5 text-[10px] text-slate-500 sm:grid-cols-2">
        <span><span className="mr-1.5 font-mono font-bold text-slate-700">NV#</span>본딩된 NVLink 수 (셀 색 = 대역폭 점유)</span>
        <span><span className="mr-1.5 font-mono font-bold text-slate-700">X</span>자기 자신</span>
        <span><span className="mr-1.5 rounded bg-sky-50 px-1 font-mono font-bold text-sky-700">PHB</span>PCIe host bridge (동일 NUMA)</span>
        <span><span className="mr-1.5 rounded bg-emerald-50 px-1 font-mono font-bold text-emerald-700">PIX</span>단일 PCIe bridge</span>
        <span><span className="mr-1.5 rounded bg-slate-100 px-1 font-mono font-bold text-slate-500">SYS</span>NUMA 교차 (PCIe + SMP interconnect)</span>
      </div>
    </div>
  );
}

// ── 메인 패널 — GPU 뷰 전환 (Grid / Topology / Matrix) ─────────────────────────
// GPU 관련 화면을 한 탭에 통합. grid 는 서버 컴포넌트(GpuCardGrid)를 슬롯으로 주입받음
// (클라이언트 상태로 서버 컴포넌트를 토글 — Next App Router "서버→클라 슬롯" 관례).
const VIEW_LABEL = { grid: "Grid", diagram: "Fabric", matrix: "Matrix" } as const;
type ViewMode = keyof typeof VIEW_LABEL;

export function GpuViews({ grid, fabric, node }: { grid: ReactNode; fabric: GpuFabric; node: string }) {
  const [mode, setMode] = useState<ViewMode>("grid");
  const n = fabric.gpus.length;

  return (
    <div>
      {/* 툴바 — 패브릭 배지 + 뷰 전환 (Grid=헬스 · Topology=인터커넥트 · Matrix=topo -m) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
          {KIND_LABEL[fabric.kind]} · {n} GPU
        </span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
          {(["grid", "diagram", "matrix"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 transition-colors ${mode === m ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {VIEW_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {mode === "grid" ? grid : mode === "diagram" ? <DiagramView fabric={fabric} node={node} /> : <MatrixView fabric={fabric} />}

      {mode !== "grid" && (
        <p className="mt-3 text-[10px] text-slate-500">
          {mode === "diagram"
            ? "DCGM PROF_NVLINK / PROF_PCIE throughput. 노드의 멀티-GPU 인터커넥트 — GPU 간 NVLink 패브릭과 host(CPU/NIC) PCIe 경로."
            : "nvidia-smi topo -m — GPU 쌍의 연결 유형과 대역폭 점유. NV# = 본딩된 NVLink, PHB/PIX/SYS = PCIe 경로 클래스."}
        </p>
      )}
    </div>
  );
}
