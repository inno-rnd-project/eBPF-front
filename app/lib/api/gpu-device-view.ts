// ───────────────────────────────────────────────────────────────────────────
// GPU 디바이스 드릴다운 어댑터 — node-view 의 toGpuInfo 기본 뷰 위에 디바이스 전용 실측을 얹는다
//   · 프로세스 = /gpu-processes (PID 귀속, command 미제공 → 공란, pod 미귀속 → "—")
//   · verdict  = 백엔드 status 가 warn/crit 일 때만 /gpu-rca 로 설명을 채운다 (임의 승격 없음)
// ───────────────────────────────────────────────────────────────────────────

import type { GpuDeviceView, GpuIdleCause, GpuProcess, GpuVerdict } from "../cluster";
import type { GpuProcessesResponse, GpuRcaResponse } from "./types";

const r2 = (v: number) => Math.round(v * 100) / 100;

export const UNATTRIBUTED_POD = "—";

export function toDeviceProcesses(res: GpuProcessesResponse | undefined, index: number): GpuProcess[] {
  if (!res?.available) return [];
  return res.processes
    .filter((p) => p.gpu_index === index)
    .map((p): GpuProcess => ({
      pid: p.pid,
      pod: p.pod ?? UNATTRIBUTED_POD,
      command: "",
      type: p.type === "graphics" ? "G" : "C",
      smUtil: (p.sm_util_percent ?? 0) / 100,
      memMB: Math.round(p.memory_used_bytes / 1024 / 1024),
    }))
    .sort((a, b) => b.memMB - a.memMB);
}

/** RCA dominant_cause → UI idle 원인 enum (pcie/network 외는 none = 미스케줄) */
export function idleCauseOf(rca: GpuRcaResponse | undefined): GpuIdleCause {
  const c = (rca?.dominant_cause ?? "").toLowerCase();
  if (c.includes("pcie")) return "pcie_saturated";
  if (c.includes("network") || c.includes("retrans")) return "network_stall";
  return "none";
}

const MODE_BY_CAUSE = {
  pcie_saturated: { mode: "idle_pcie_saturated", label: "Idle · PCIe 포화" },
  network_stall: { mode: "idle_network_stall", label: "Idle · 통신 정체" },
  none: { mode: "idle_unscheduled", label: "Idle · 미스케줄" },
} as const;

/** base verdict 가 ok 면 그대로(배너 미표시). warn/crit 일 때만 RCA 근거로 설명을 채운다 */
export function toDeviceVerdict(base: GpuVerdict, view: GpuDeviceView, rca: GpuRcaResponse | undefined): GpuVerdict {
  if (base.severity === "ok" || !rca) return base;
  const cause = idleCauseOf(rca);
  const idleMode = view.idle && base.mode !== "throttled" ? MODE_BY_CAUSE[cause] : null;
  const ev = rca.evidence;
  const evidence = [
    ...base.evidence,
    ...rca.causes.slice(0, 3).map((c) => `${c.cause} weight ${c.weight.toFixed(2)} — ${c.description}`),
    [
      ev.gpu_utilization_percent != null ? `GPU util ${r2(ev.gpu_utilization_percent)}%` : null,
      ev.retrans_per_sec != null ? `retrans ${r2(ev.retrans_per_sec)}/s` : null,
      ev.max_srtt_seconds != null ? `max srtt ${(ev.max_srtt_seconds * 1000).toFixed(0)}ms` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  ].filter(Boolean);
  const culprits = rca.suspects
    .filter((s) => s.pod)
    .slice(0, 3)
    .map((s) => ({ pod: s.pod!, score: r2(s.score) }));
  return {
    ...base,
    ...(idleMode ? { mode: idleMode.mode, modeLabel: idleMode.label } : {}),
    detail: rca.narrative || base.detail,
    evidence,
    culprits,
    culpritLabel: culprits.length ? `${rca.suspects[0]?.source ?? "suspect"} · ${rca.suspects[0]?.dimension ?? ""}`.trim() : null,
  };
}
