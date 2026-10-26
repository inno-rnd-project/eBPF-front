// ───────────────────────────────────────────────────────────────────────────
// 노드 드릴다운 어댑터 — API 응답 → 기존 charts.tsx prop 형태 (UI 보존)
//   · 실측이 없는 신호는 지어내지 않고 각 컴포넌트의 empty state 로 강등한다.
//   · severity 소스는 백엔드 status 단일 (어댑터가 임의로 승격하지 않음).
// ───────────────────────────────────────────────────────────────────────────

import type { PodResourceRow, PodState, ScoreItem } from "../charts";
import {
  type AnomalyKind,
  type DiagDimension,
  type Diagnosis,
  DIM_ACTION,
  DIM_LABEL,
  type DropReasonRow,
  type GpuAgentHealth,
  type GpuDevice as UiGpuDevice,
  type GpuDeviceView,
  type GpuFailureMode,
  type GpuIcLink,
  type GpuIcNode,
  type GpuInfo,
  type GpuProcess as UiGpuProcess,
  type GpuSeries,
  type GpuVerdict,
  type NetFlow,
  type NetobsAgentHealth,
  type NodeAlert,
  type NodeDisplayStatus,
  type NodeHealth,
  type NodeStageLatency,
  type NoisyNeighbor,
  NOISY_SIGNALS,
  type NoisySignal,
  type ServiceTopo,
  type Severity,
  type SvcEdge,
  type SvcNode,
  type SvcSeverity,
} from "../cluster";
import { nodeDisplayStatusOf, podDisplayStatusOf } from "./status";
import type {
  AgentHealth,
  BandwidthResponse,
  DropsResponse,
  GpuDevice,
  GpuStatusResponse,
  IncidentEpisode,
  LatencyBreakdownResponse,
  NodeDetailResponse,
  NodeMapNode,
  NodePodResource,
  NoisyNeighborItem,
  PressureResponse,
} from "./types";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

// ── 공용 매핑 ────────────────────────────────────────────────────────────────

/** 백엔드 severity/status 문자열 → UI severity. low·healthy·ok 는 정상 */
export function severityFromString(s: string | undefined): Severity | "ok" {
  const v = (s ?? "").toLowerCase();
  if (v === "high" || v === "critical" || v === "crit" || v === "down") return "crit";
  if (v === "elevated" || v === "warning" || v === "warn" || v === "degraded") return "warn";
  return "ok";
}

/** API 차원 키 → 진단 차원 */
export function dimFromApi(d: string | undefined): DiagDimension {
  if (d === "cpu") return "cpu";
  if (d === "memory") return "mem";
  if (d === "network") return "net";
  if (d === "gpu") return "gpu";
  return "node";
}

/** alertname → 진단 차원 (NetObsHighStageLatencyP99 → latency 등) */
function dimFromAlert(alertname: string): DiagDimension {
  const a = alertname.toLowerCase();
  if (a.includes("latency")) return "latency";
  if (a.includes("drop") || a.includes("retrans") || a.includes("net")) return "net";
  if (a.includes("gpu")) return "gpu";
  if (a.includes("memory") || a.includes("oom")) return "mem";
  if (a.includes("cpu") || a.includes("throttl")) return "cpu";
  if (a.includes("error") || a.includes("5xx")) return "errors";
  return "node";
}

const DIM_TO_KIND: Record<DiagDimension, AnomalyKind> = {
  cpu: "cpu",
  mem: "mem",
  net: "net",
  gpu: "node",
  node: "node",
  latency: "latency",
  errors: "errors",
};

/** "namespace/pod" 결합 문자열 또는 pod_name → 파드명 */
export function podNameOf(entry: { pod?: string; pod_name?: string }): string {
  return entry.pod_name ?? entry.pod?.split("/").pop() ?? "";
}

const API_DIM_LABEL: Record<string, string> = { cpu: "cpu", memory: "memory", network: "network", gpu: "gpu" };

const firingOf = (incidents: IncidentEpisode[]) => incidents.filter((i) => i.status === "firing");

function incidentPod(i: IncidentEpisode): string | undefined {
  return i.pod ?? i.labels.pod ?? i.labels.src_pod ?? i.labels.victim_pod;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(d);
}

// ── 상태 / 진단 / health ─────────────────────────────────────────────────────

/** 노드 표시 상태 — /node/{node} 의 단일 판정(status_unified) 우선, 로딩 중엔 node-map */
export function toNodeDisplayStatus(detail: NodeDetailResponse | undefined, mapNode: NodeMapNode | undefined): NodeDisplayStatus {
  if (mapNode && nodeDisplayStatusOf(mapNode.status) === "down") return "down";
  const s = detail?.status_unified ?? detail?.status ?? mapNode?.status;
  return s ? nodeDisplayStatusOf(s) : "ok";
}

/** /node/{node} + 발화 중 alert → 진단 카드. headline/detail 은 백엔드 판정 근거를 그대로 쓴다 */
export function toNodeDiagnosis(detail: NodeDetailResponse, incidents: IncidentEpisode[], display: NodeDisplayStatus): Diagnosis {
  const node = detail.node;
  const firing = firingOf(incidents);

  if (display === "down") {
    return {
      severity: "crit",
      dimension: "node",
      dimHealth: 0,
      headline: `${node} 가 NotReady 상태입니다`,
      detail: detail.summary,
      ebpf: [],
      signalSource: "control-plane",
      culprits: [],
      chain: null,
      action: DIM_ACTION.node,
      confidence: detail.confidence,
    };
  }

  const severity: Severity | "ok" = display === "ok" ? "ok" : display;
  // alert 기준 판정이면 판정에 쓰인 alert 의 차원, 아니면 지배 압박 차원
  const byAlert = detail.status_basis === "alert" ? (firing.find((f) => detail.status_alerts?.includes(f.alertname)) ?? firing[0]) : undefined;
  const dimension = byAlert ? dimFromAlert(byAlert.alertname) : dimFromApi(detail.dominant_dimension);
  const healthKey = ({ cpu: "cpu", mem: "memory", net: "network", gpu: "gpu" } as Record<string, "cpu" | "memory" | "network" | "gpu">)[dimension];
  const dimHealth = r2(healthKey ? (detail.health[healthKey] ?? 1) : 1);

  if (severity === "ok") {
    return {
      severity,
      dimension,
      dimHealth,
      headline: `${node} 노드는 정상입니다`,
      detail: detail.summary,
      ebpf: [],
      signalSource: "ebpf",
      culprits: [],
      chain: null,
      action: firing.length ? "노드는 정상 — 발화 중 알림은 알림 탭에서 점검" : "정기 모니터링 유지",
      confidence: r2(detail.confidence),
    };
  }

  const pressureLine = Object.entries(detail.pressure)
    .map(([k, v]) => `${API_DIM_LABEL[k] ?? k} ${(v ?? 0).toFixed(2)}`)
    .join(" · ");
  const notes = Object.entries(detail.health_notes ?? {})
    .filter(([, v]) => v && v !== "no_gpu")
    .map(([k, v]) => `${k}(${v})`);
  const ebpf = [
    ...firing.slice(0, 3).map((f) => {
      const where = [f.labels.src_namespace && f.labels.src_workload ? `${f.labels.src_namespace}/${f.labels.src_workload}` : null, f.labels.stage ? `stage ${f.labels.stage}` : null]
        .filter(Boolean)
        .join(" · ");
      return `alert ${f.alertname} firing since ${fmtTime(f.starts_at)}${where ? ` (${where})` : ""}`;
    }),
    `pressure ${pressureLine}`,
    ...(notes.length ? [`health 측정 불가: ${notes.join(", ")}`] : []),
  ];

  const seen = new Set<string>();
  const culprits = detail.top_pods
    .filter((p) => p.pressure > 0)
    .map((p) => ({ pod: podNameOf(p), score: r2(p.pressure) }))
    .filter((c) => (seen.has(c.pod) ? false : (seen.add(c.pod), true)))
    .slice(0, 3);

  return {
    severity,
    dimension,
    dimHealth,
    headline: byAlert ? `${node} — ${byAlert.title ?? byAlert.alertname}` : `${node} ${DIM_LABEL[dimension]} 압박`,
    detail: byAlert?.summary ? `${byAlert.summary}. ${detail.summary}` : detail.summary,
    ebpf,
    signalSource: "ebpf",
    culprits,
    chain: null,
    action: DIM_ACTION[dimension],
    confidence: r2(detail.confidence),
  };
}

/** /node/{node} 응답 전(또는 실패) 진단 카드 자리 — 판정을 지어내지 않는다 */
export function toDiagnosisPlaceholder(node: string, failed: boolean): Diagnosis {
  return {
    severity: "ok",
    dimension: "node",
    dimHealth: 1,
    headline: failed ? `${node} 진단 데이터를 불러오지 못했습니다` : `${node} 진단 중…`,
    detail: failed ? "GET /node/{node} 요청이 실패했습니다. 잠시 후 자동으로 다시 시도합니다." : "노드 판정(pressure·alert)을 불러오는 중입니다.",
    ebpf: [],
    signalSource: "ebpf",
    culprits: [],
    chain: null,
    action: "",
    confidence: 0,
  };
}

/** health 미산출 차원은 1(압박 없음)로 — 측정 불가 사유는 진단 카드 신호에 노출 */
export function toNodeHealth(detail: NodeDetailResponse, isGpu: boolean): NodeHealth {
  const h = detail.health;
  return {
    cpu: r2(h.cpu ?? 1),
    net: r2(h.network ?? 1),
    mem: r2(h.memory ?? 1),
    gpu: isGpu ? r2(h.gpu ?? 1) : null,
  };
}

// ── 알림 ─────────────────────────────────────────────────────────────────────

/** 발화 중 incident → 알림 목록. 파드 링크는 이 노드에 실재하는 파드일 때만 */
export function toNodeAlerts(incidents: IncidentEpisode[], podsOnNode: Set<string>): NodeAlert[] {
  return firingOf(incidents)
    .map((i): NodeAlert => {
      const pod = incidentPod(i);
      return {
        name: i.alertname,
        severity: severityFromString(i.severity) === "crit" ? "crit" : "warn",
        component: i.component,
        pod: pod && podsOnNode.has(pod) ? pod : null,
        kind: DIM_TO_KIND[dimFromAlert(i.alertname)],
      };
    })
    .sort((x, y) => (x.severity === y.severity ? 0 : x.severity === "crit" ? -1 : 1));
}

// ── 파드 자원 표 ─────────────────────────────────────────────────────────────

function fmtBytes(b: number) {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)}GiB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)}MiB`;
  return `${(b / 1024).toFixed(0)}KiB`;
}

export function fmtRate(bps: number) {
  if (bps >= 1024 ** 2) return `${(bps / 1024 ** 2).toFixed(1)}MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(1)}KB/s`;
  return `${bps.toFixed(0)}B/s`;
}

/** GET /node/{node}/pods → 표 행. percent 는 limit 있는 pod 만 → 없으면 원값(cores·bytes) 표기 */
export function toPodResourceRows(pods: NodePodResource[]): PodResourceRow[] {
  return pods.map((p) => {
    const unobserved = !!p.unobserved_reason;
    const sev = severityFromString(p.severity);
    const state: PodState = unobserved ? "nodata" : sev;
    const cpu =
      p.cpu_percent != null
        ? { pct: Math.round(p.cpu_percent), text: `${Math.round(p.cpu_percent)}%` }
        : p.cpu_usage_cores != null
          ? { text: `${p.cpu_usage_cores.toFixed(3)} cores` }
          : null;
    const mem =
      p.memory_percent != null
        ? { pct: Math.round(p.memory_percent), text: `${Math.round(p.memory_percent)}%` }
        : p.memory_working_set_bytes != null
          ? { text: fmtBytes(p.memory_working_set_bytes) }
          : null;
    const net = p.network_bytes_per_sec != null ? { text: fmtRate(p.network_bytes_per_sec) } : null;
    return {
      pod: p.pod,
      state,
      cpu: unobserved ? null : cpu,
      mem: unobserved ? null : mem,
      net: unobserved ? null : net,
      sortValue: p.cpu_usage_cores ?? -1,
    };
  });
}

// ── CPU / 네트워크 ───────────────────────────────────────────────────────────

/** cpu throttle 지표가 노드 단위로 없어 /pressure(cpu, scope=pod) 로 대체 */
export function toCpuPressureItems(res: PressureResponse | undefined): ScoreItem[] {
  return (res?.ranking ?? []).slice(0, 12).map((r) => {
    const sev = severityFromString(r.severity);
    return { label: podNameOf(r), value: r2(r.pressure), severity: sev === "ok" ? undefined : sev };
  });
}

const DROP_CATS = ["drop policy", "drop queue", "drop unknown", "retrans"] as const;

export function toDropAgg(drops: DropsResponse | undefined): ScoreItem[] {
  if (!drops) return [];
  const sum = (cat: string) =>
    drops.drops.filter((d) => (d.category === "policy" || d.category === "queue" ? d.category : "unknown") === cat).reduce((s, d) => s + d.drops_per_sec, 0);
  return DROP_CATS.map((label) => ({
    label,
    value: r2(label === "retrans" ? drops.retrans.reduce((s, r) => s + r.retrans_per_sec, 0) : sum(label.replace("drop ", ""))),
  }));
}

export function toRetransRows(drops: DropsResponse | undefined): { workload: string; node: string; rate: number }[] {
  if (!drops) return [];
  const agg = new Map<string, { workload: string; node: string; rate: number }>();
  for (const r of drops.retrans) {
    const key = `${r.namespace}/${r.workload}`;
    const cur = agg.get(key) ?? { workload: key, node: r.node, rate: 0 };
    cur.rate += r.retrans_per_sec;
    agg.set(key, cur);
  }
  return [...agg.values()]
    .map((r) => ({ ...r, rate: r3(r.rate) }))
    .filter((r) => r.rate > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 12);
}

export function toDropReasonRows(drops: DropsResponse | undefined): DropReasonRow[] {
  if (!drops) return [];
  return [...drops.drops]
    .sort((a, b) => b.drops_per_sec - a.drops_per_sec)
    .slice(0, 10)
    .map((d) => ({
      reason: d.reason,
      category: d.category,
      namespace: d.namespace,
      workload: d.workload,
      node: d.node,
      rate: r2(d.drops_per_sec),
    }));
}

/** ip_version 별 집계는 flow detail(allow-list) 활성 시에만 — 아니면 비활성 안내 */
export function toNetFlow(drops: DropsResponse | undefined): NetFlow {
  const enabled = !!drops?.flow_detail_enabled && drops.flows.length > 0;
  const rateOf = (v: string) =>
    r2((drops?.flows ?? []).filter((f) => f.ip_version.replace(/^ipv?/i, "") === v).reduce((s, f) => s + f.drops_per_sec, 0));
  return { ipv4Bytes: 0, ipv6Bytes: 0, ipv4DropRate: enabled ? rateOf("4") : 0, ipv6DropRate: enabled ? rateOf("6") : 0, allowNamespaces: enabled };
}

// 경로 순서 — 응답은 p99 내림차순이라 파이프라인 순서로 재정렬
const TX_ORDER = ["connect", "sendmsg_ret", "tcp_transmit_skb", "tcp_write_xmit", "to_devq", "to_veth"];
const RX_ORDER = ["rcv_nic", "rcv_demux", "rcv_established", "rcv_app", "ack_wait"];

export function toStages(res: LatencyBreakdownResponse | undefined, order: string[]) {
  const t = res?.targets[0];
  if (!t) return { stages: [] as { stage: string; p99: number }[], bottleneck: "—" };
  const rank = (s: string) => {
    const i = order.indexOf(s);
    return i < 0 ? order.length : i;
  };
  const stages = [...t.stages]
    .sort((a, b) => rank(a.stage) - rank(b.stage))
    .map((s) => ({ stage: s.stage, p99: Math.round(s.p99_seconds * 1e6) }));
  return { stages, bottleneck: t.dominant_stage };
}

export function toStageLatency(egress: LatencyBreakdownResponse | undefined, ingress: LatencyBreakdownResponse | undefined): NodeStageLatency {
  const tx = toStages(egress, TX_ORDER);
  const rx = toStages(ingress, RX_ORDER);
  return { tx: tx.stages, rx: rx.stages, txBottleneck: tx.bottleneck, rxBottleneck: rx.bottleneck };
}

export { RX_ORDER, TX_ORDER };

// ── 에이전트 self-health ─────────────────────────────────────────────────────

/** 프로그램별 목록·ringbuf·map util·retry 는 API 미제공 → 빈 값(각 패널 empty state) */
export function toNetobsAgent(agent: AgentHealth | undefined): NetobsAgentHealth {
  const loaded = agent?.bpf_programs_loaded ?? 0;
  const total = agent?.bpf_programs_total ?? loaded;
  const failed = agent?.bpf_attach_failures_5m ?? Math.max(0, total - loaded);
  return {
    up: !!agent?.up,
    informerSyncLagS: r2(agent?.informer_lag_seconds ?? 0),
    programs: [],
    attachedCount: loaded,
    failedCount: failed,
    ringbufDropRate: 0,
    maps: [],
    attachResult: { success: loaded, failure: failed },
    retryPressure: [],
  };
}

export function toGpuAgent(agent: AgentHealth | undefined): GpuAgentHealth {
  // 심볼 단위 목록은 없고 driver/runtime 부착 여부(bool)만 온다 → 그 두 그룹을 칩으로
  const cudaSymbols = [
    { name: "cu* (driver API)", attached: !!agent?.cuda_driver_symbols },
    { name: "cuda* (runtime API)", attached: !!agent?.cuda_runtime_symbols },
  ];
  const nvmlErr = agent?.nvml_errors_per_sec ?? 0;
  return {
    up: !!agent?.up,
    informerSyncLagS: r2(agent?.informer_lag_seconds ?? 0),
    cudaSymbols,
    attachedCount: cudaSymbols.filter((s) => s.attached).length,
    missingCount: cudaSymbols.filter((s) => !s.attached).length,
    nvmlP99: [],
    nvmlErrors: nvmlErr > 0 ? [{ code: "NVML errors (all calls)", rate: r2(nvmlErr) }] : [],
  };
}

// ── GPU ──────────────────────────────────────────────────────────────────────

const PCIE_LANE_GBS: Record<number, number> = { 1: 0.25, 2: 0.5, 3: 0.985, 4: 1.969, 5: 3.938 };
const MB = 1024 * 1024;

export function toUiGpuDevice(d: GpuDevice): UiGpuDevice {
  const index = Number(d.gpu_index);
  const th = d.temperature_thresholds_celsius ?? {};
  const reasons = d.throttle_reasons ?? [];
  const gen = d.pcie_link_generation ?? 4;
  const width = d.pcie_link_width ?? 16;
  return {
    name: `gpu=${index}`,
    index,
    model: d.model,
    util: (d.sm_active_percent ?? d.utilization_percent ?? 0) / 100,
    memUsedMB: Math.round((d.memory_used_bytes ?? 0) / MB),
    memTotalMB: Math.round((d.memory_total_bytes ?? 0) / MB),
    tempC: Math.round(d.temperature_celsius ?? 0),
    tempSlowdownC: th.slowdown ?? th.gpu_max ?? 0,
    tempShutdownC: th.shutdown ?? 0,
    tempMaxC: th.gpu_max ?? th.slowdown ?? 0,
    powerW: Math.round((d.power_usage_watts ?? 0) * 10) / 10,
    powerLimitW: Math.round(d.power_limit_watts ?? 0),
    graphicsClockMHz: d.clocks_mhz?.graphics ?? 0,
    hwThermalSlowdown: reasons.includes("hw_thermal_slowdown"),
    throttleReasons: reasons.length ? reasons : ["none"],
    pcieGbs: r2(((d.pcie_rx_bytes_per_second ?? 0) + (d.pcie_tx_bytes_per_second ?? 0)) / 1e9),
    pcieMaxGbs: r2((PCIE_LANE_GBS[gen] ?? PCIE_LANE_GBS[4]) * width),
  };
}

/** 이력 API 가 없어 현재값으로 채운 평탄 시계열 — GpuLivePanel 이 틱마다 이어 붙인다 */
function flatSeries(d: UiGpuDevice, n = 30): GpuSeries {
  return {
    temp: Array(n).fill(d.tempC),
    power: Array(n).fill(d.powerW),
    clock: Array(n).fill(d.graphicsClockMHz),
    thermalSlowdown: Array(n).fill(d.hwThermalSlowdown ? 1 : 0),
  };
}

const GPU_MODE_LABEL: Record<GpuFailureMode, string> = {
  ok: "정상 활용",
  idle_pcie_saturated: "Idle · PCIe 포화",
  idle_network_stall: "Idle · 통신 정체",
  idle_unscheduled: "Idle · 미스케줄",
  throttled: "Throttled",
  unobservable: "관측 불가",
};

/** 디바이스 기본 verdict — severity 는 gpu-status 의 status 그대로 (idle 승격 없음) */
export function baseDeviceVerdict(d: GpuDevice, ui: UiGpuDevice, perPodAvailable: boolean): GpuVerdict {
  const severity = severityFromString(d.status);
  const sm = Math.round(ui.util * 100);
  const throttled = ui.throttleReasons.some((r) => r !== "none" && r !== "gpu_idle");
  const mode: GpuFailureMode = severity === "ok" ? "ok" : throttled ? "throttled" : d.idle ? "idle_unscheduled" : "throttled";
  return {
    mode,
    modeLabel: GPU_MODE_LABEL[mode],
    severity,
    headline: severity === "ok" ? `${ui.name} — 상태 정상 (${d.status})` : `${ui.name} — ${d.status}`,
    detail: `SM ${sm}% · VRAM ${(ui.memUsedMB / 1024).toFixed(1)}/${(ui.memTotalMB / 1024).toFixed(0)}GB · 온도 ${ui.tempC}°C · 전력 ${ui.powerW}W`,
    evidence: [
      `SM ${sm}% · 온도 ${ui.tempC}°C · 전력 ${ui.powerW}W · 클럭 ${ui.graphicsClockMHz}MHz`,
      `throttle reasons: ${ui.throttleReasons.join(", ")}`,
    ],
    chain: null,
    culprits: [],
    culpritLabel: null,
    attributionBlind: !perPodAvailable,
    action: severity === "ok" ? "정기 모니터링 유지" : "throttle 원인(열/전력) 및 워크로드 배치 점검",
  };
}

const SEV_HEALTH: Record<Severity | "ok", number> = { ok: 1, warn: 0.6, crit: 0.3 };

/** 디바이스 레벨 interconnect — 측정되는 것은 host PCIe 와 NIC(netobs) 뿐 (NVLink 미수집) */
export function toInterconnect(ui: UiGpuDevice, d: GpuDevice, nic: { gbs: number; maxGbs: number } | null): { nodes: GpuIcNode[]; links: GpuIcLink[] } {
  const nodes: GpuIcNode[] = [
    { id: "cpu", label: "CPU (host)", kind: "cpu", x: 22, y: 50 },
    { id: "gpu", label: `GPU ${ui.index}`, kind: "gpu", x: 72, y: 30 },
  ];
  const links: GpuIcLink[] = [
    { from: "cpu", to: "gpu", kind: "pcie", gbs: ui.pcieGbs, maxGbs: ui.pcieMaxGbs, label: `PCIe Gen${d.pcie_link_generation ?? "?"} x${d.pcie_link_width ?? "?"}` },
  ];
  if (nic) {
    nodes.push({ id: "nic", label: "NIC", kind: "nic", x: 72, y: 74 });
    links.push({ from: "cpu", to: "nic", kind: "pcie", gbs: nic.gbs, maxGbs: nic.maxGbs, label: "NIC TX" });
  }
  return { nodes, links };
}

/** gpu-status → 노드 GpuInfo. 파드 귀속은 device.pods (프로세스 PID 는 디바이스 페이지에서 /gpu-processes) */
export function toGpuInfo(status: GpuStatusResponse | undefined, gpuAgent: AgentHealth | undefined, nic: { gbs: number; maxGbs: number } | null = null): GpuInfo {
  const devices = [...(status?.devices ?? [])].sort((a, b) => Number(a.gpu_index) - Number(b.gpu_index));
  const perPodAvailable = devices.some((d) => d.pod_attribution.available);
  const views: GpuDeviceView[] = devices.map((d) => {
    const ui = toUiGpuDevice(d);
    const verdict = baseDeviceVerdict(d, ui, perPodAvailable);
    const processes: UiGpuProcess[] = d.pods.map((p) => ({
      pid: 0,
      pod: p.pod,
      command: "",
      type: "C",
      smUtil: (p.utilization_percent ?? 0) / 100,
      memMB: Math.round(p.memory_used_bytes / MB),
    }));
    return {
      device: ui,
      series: flatSeries(ui),
      idle: !!d.idle,
      health: SEV_HEALTH[verdict.severity],
      dominantCause: "none",
      processes,
      cudaActivity: null,
      memSeries: null,
      interconnect: toInterconnect(ui, d, nic),
      events: [],
      verdict,
    };
  });
  const memMap = new Map<string, number>();
  for (const v of views) for (const p of v.processes) memMap.set(p.pod, (memMap.get(p.pod) ?? 0) + p.memMB);
  return {
    views,
    memPods: [...memMap.entries()].map(([pod, memMB]) => ({ pod, memMB })).sort((a, b) => b.memMB - a.memMB),
    idle: views.length > 0 && views.every((v) => v.idle),
    health: views.reduce((m, v) => Math.min(m, v.health), 1),
    dominantCause: "none",
    agent: toGpuAgent(gpuAgent),
    perPodAvailable,
  };
}

/** /bandwidth 노드 엔트리 → NIC TX 링크 (GB/s) */
export function nicLinkOf(bw: BandwidthResponse | undefined, node: string): { gbs: number; maxGbs: number } | null {
  const n = bw?.nodes.find((x) => x.node === node);
  if (!n || !n.nic_capacity_bytes_per_sec) return null;
  return { gbs: r3(n.nic_tx_bytes_per_sec / 1e9), maxGbs: r2(n.nic_capacity_bytes_per_sec / 1e9) };
}

// ── noisy neighbor ───────────────────────────────────────────────────────────

/** victim_signal 실 enum(latency/throughput/error/gpu)이 UI enum 과 달라 latency 외엔 dimension 으로 근사, gpu 는 제외 */
function noisySignalOf(it: NoisyNeighborItem): NoisySignal | null {
  if (it.victim_signal === "latency") return "latency";
  if (it.dimension === "memory") return "memory";
  if (it.dimension === "network") return "network";
  if (it.dimension === "cpu") return "cpu";
  return null;
}

/** 이 노드의 파드가 suspect/victim 인 항목만. signal 그룹별 causal_strength 순위 */
export function toNoisyRows(items: NoisyNeighborItem[] | undefined, podsOnNode: Set<string>): NoisyNeighbor[] {
  const rows: NoisyNeighbor[] = [];
  for (const it of items ?? []) {
    if (!podsOnNode.has(it.suspect.pod) && !podsOnNode.has(it.victim.pod)) continue;
    const signal = noisySignalOf(it);
    if (!signal) continue;
    rows.push({
      rank: 0,
      signal,
      suspectNs: it.suspect.namespace,
      suspect: it.suspect.pod,
      victimNs: it.victim.namespace,
      victim: it.victim.pod,
      score: r3(it.score),
      lagSeconds: it.lag_steps,
      impactSeconds: r2(it.impact_seconds),
      causalStrength: it.causal_strength,
    });
  }
  const ranked: NoisyNeighbor[] = [];
  for (const s of NOISY_SIGNALS) {
    const group = rows.filter((r) => r.signal === s).sort((a, b) => b.causalStrength - a.causalStrength);
    group.forEach((r, i) => (r.rank = i + 1));
    ranked.push(...group);
  }
  return ranked;
}

// ── 서비스 토폴로지 ──────────────────────────────────────────────────────────

const SVC_SEV_RANK = (s: SvcSeverity) => (s === "crit" ? 3 : s === "warn" ? 2 : s === "ok" ? 1 : 0);

/** 워크로드 이름 근사 — ReplicaSet/DaemonSet 해시 접미사 제거 */
export function workloadOf(pod: string) {
  return pod
    .replace(/-[a-z0-9]{8,10}-[a-z0-9]{5}$/, "")
    .replace(/-[a-z0-9]{5}$/, "")
    .replace(/-\d+$/, "");
}

/** node-map(파드·상태) + /bandwidth(트래픽) + noisy-neighbor(간섭 엣지) → 서비스(워크로드) 관계 그래프 */
export function toServiceTopology(mapNode: NodeMapNode, bw: BandwidthResponse | undefined, noisy: NoisyNeighbor[]): ServiceTopo | null {
  const pods = mapNode.pods;
  if (!pods.length) return null;
  const live = pods.filter((p) => !p.no_data);
  if (!live.length) return null;

  const traffic = new Map<string, number>();
  for (const p of bw?.pods ?? []) traffic.set(p.pod, p.rx_bytes_per_sec + p.tx_bytes_per_sec);
  const maxTraffic = Math.max(...pods.map((p) => traffic.get(p.pod) ?? 0), 1);

  const order: string[] = [];
  const groups = new Map<string, typeof pods>();
  for (const p of pods) {
    const s = workloadOf(p.pod);
    if (!groups.has(s)) {
      groups.set(s, []);
      order.push(s);
    }
    groups.get(s)!.push(p);
  }

  const N = order.length;
  const R = N === 1 ? 0 : 34;
  const idxOf = new Map<string, number>();
  const nodes: SvcNode[] = order.map((service, i) => {
    const gp = groups.get(service)!;
    const livePods = gp.filter((p) => !p.no_data);
    const ang = (-90 + (360 * i) / N) * (Math.PI / 180);
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const anchor: "start" | "middle" | "end" = N === 1 || Math.abs(cos) < 0.3 ? "middle" : cos > 0 ? "start" : "end";
    let severity: SvcSeverity = livePods.length ? "ok" : "nodata";
    let rep = gp[0];
    let repRank = -1;
    for (const p of gp) {
      const d = podDisplayStatusOf(p);
      const s: SvcSeverity = d === "nodata" ? "nodata" : d === "crit" || d === "down" ? "crit" : d === "warn" ? "warn" : "ok";
      if (SVC_SEV_RANK(s) > SVC_SEV_RANK(severity)) severity = s;
      const rk = SVC_SEV_RANK(s) * 1e12 + (traffic.get(p.pod) ?? 0);
      if (rk > repRank) {
        repRank = rk;
        rep = p;
      }
    }
    const avgTraffic = livePods.length ? livePods.reduce((s, p) => s + (traffic.get(p.pod) ?? 0), 0) / livePods.length : 0;
    idxOf.set(service, i);
    return {
      service,
      pods: gp.length,
      live: livePods.length,
      x: r2(50 + R * cos),
      y: r2(50 + R * sin),
      labelX: r2(50 + (R + 8) * cos),
      labelY: r2(50 + (R + 8) * sin),
      anchor,
      traffic: Math.round((avgTraffic / maxTraffic) * 100),
      severity,
      repPod: rep.pod,
      degree: 0,
    };
  });

  const maxScore = noisy.reduce((m, r) => Math.max(m, r.score), 0) || 1;
  const agg = new Map<string, SvcEdge>();
  const suspectCount = new Map<string, number>();
  for (const r of noisy) {
    const fromSvc = workloadOf(r.suspect);
    const toSvc = workloadOf(r.victim);
    const fi = idxOf.get(fromSvc);
    const ti = idxOf.get(toSvc);
    if (fi == null || ti == null) continue;
    const key = `${fromSvc}->${toSvc}`;
    const cur = agg.get(key);
    if (cur) {
      cur.count++;
      if (r.score > cur.score) {
        cur.score = r.score;
        cur.signal = r.signal;
      }
    } else {
      agg.set(key, { from: fromSvc, to: toSvc, fromIdx: fi, toIdx: ti, signal: r.signal, score: r.score, count: 1, self: fromSvc === toSvc, strong: false });
    }
    suspectCount.set(fromSvc, (suspectCount.get(fromSvc) ?? 0) + 1);
  }
  const edges = [...agg.values()];
  for (const e of edges) {
    e.strong = e.score >= 0.82 * maxScore;
    nodes[e.fromIdx].degree++;
    if (!e.self) nodes[e.toIdx].degree++;
  }
  const top = [...suspectCount.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    node: mapNode.name,
    nodes,
    edges,
    serviceCount: N,
    liveCount: live.length,
    linkCount: edges.length,
    topSuspect: top ? { service: top[0], count: top[1] } : null,
  };
}

/** 워크로드명(namespace/workload 또는 workload) → 이 노드의 대표 파드 (링크용) */
export function podForWorkload(label: string, podsOnNode: string[]): string | undefined {
  const wl = label.split("/").pop() ?? label;
  return podsOnNode.find((p) => p === wl || p.startsWith(`${wl}-`));
}
