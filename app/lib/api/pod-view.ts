// ───────────────────────────────────────────────────────────────────────────
// 파드 드릴다운 어댑터 — API 응답 → 기존 charts.tsx prop 형태 (UI 보존)
//   진단은 백엔드 판정(node-map 파드 status/issues · 발화 alert)만 근거로 쓰고,
//   /pod/{ns}/{pod} 실측(health·vitals·throttle·net)을 근거 신호로 붙인다.
// ───────────────────────────────────────────────────────────────────────────

import type { ScoreItem } from "../charts";
import {
  DIM_ACTION,
  type Diagnosis,
  type NodeHealth,
  type NoisyNeighbor,
  type PodGpuUsage,
} from "../cluster";
import { dimFromApi, fmtRate, RX_ORDER, toStages, TX_ORDER } from "./node-view";
import type {
  BandwidthResponse,
  DropsResponse,
  GpuStatusResponse,
  IncidentEpisode,
  LatencyBreakdownResponse,
  NodeMapPod,
  PodDetailResponse,
} from "./types";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** 파드명이 이 워크로드의 레플리카인가 (deploy-rs해시-xxxxx · ds-xxxxx · sts-0) */
function belongsTo(pod: string, workload: string) {
  return pod === workload || pod.startsWith(`${workload}-`);
}

/** /drops·/retrans 의 workload 단위 항목 중 이 파드가 속한 것 (가장 긴 이름 매칭) */
function matchWorkload(names: string[], pod: string): string | undefined {
  return names.filter((w) => belongsTo(pod, w)).sort((a, b) => b.length - a.length)[0];
}

export function podHasTelemetry(detail: PodDetailResponse | undefined) {
  if (!detail) return false;
  return Object.keys(detail.vitals).length > 0 || Object.keys(detail.health).length > 0;
}

/** health 미산출 차원(limit 없음 등)은 1 — 사유는 진단 근거 신호에 노출 */
export function toPodHealth(detail: PodDetailResponse): NodeHealth {
  const h = detail.health;
  return { cpu: r2(h.cpu ?? 1), net: r2(h.network ?? 1), mem: r2(h.memory ?? 1), gpu: null };
}

function measuredLines(detail: PodDetailResponse): string[] {
  const out: string[] = [];
  const t = detail.cpu.throttled_ratio;
  if (t != null) {
    out.push(
      `cgroup throttled ${Math.round(t * 100)}%${detail.cpu.throttled_periods_5m != null && detail.cpu.total_periods_5m != null ? ` (${Math.round(detail.cpu.throttled_periods_5m)}/${Math.round(detail.cpu.total_periods_5m)} periods · 5m)` : ""}${detail.cpu.limit_cores != null ? ` · limit ${detail.cpu.limit_cores} cores` : ""}`,
    );
  }
  const v = detail.vitals;
  if (v.memory_percent != null) out.push(`memory working set ${Math.round(v.memory_percent)}% of limit`);
  const n = detail.network;
  const net = [
    n.retrans_per_sec != null ? `retrans ${r2(n.retrans_per_sec)}/s` : null,
    n.drop_per_sec != null ? `drop ${r2(n.drop_per_sec)}/s` : null,
    n.max_srtt_seconds != null ? `max srtt ${(n.max_srtt_seconds * 1000).toFixed(1)}ms` : null,
  ].filter(Boolean);
  if (net.length) out.push(net.join(" · "));
  if (detail.unmeasured_dimensions?.length) out.push(`limit 없음 → pressure 측정 불가: ${detail.unmeasured_dimensions.join(", ")}`);
  return out;
}

/**
 * 파드 진단 — severity 는 node-map 파드 status 그대로 (down→crit, warning→warn).
 * 텔레메트리도 사건도 없으면 null (호출부에서 "데이터 없음").
 */
export function toPodDiagnosis(
  mapPod: NodeMapPod,
  detail: PodDetailResponse | undefined,
  incidents: IncidentEpisode[],
  noisy: NoisyNeighbor[],
): Diagnosis | null {
  const pod = mapPod.pod;
  const firing = incidents.filter((i) => i.status === "firing");
  const asVictim = noisy.filter((r) => r.victim === pod).sort((a, b) => b.causalStrength - a.causalStrength);
  const asSuspect = noisy.filter((r) => r.suspect === pod).sort((a, b) => b.causalStrength - a.causalStrength);
  const chain = asVictim[0]
    ? `${asVictim[0].suspect} → ${pod} ${asVictim[0].signal} 간섭 (score ${asVictim[0].score.toFixed(3)})`
    : asSuspect[0]
      ? `${pod} → ${asSuspect[0].victim} ${asSuspect[0].signal} 간섭 (score ${asSuspect[0].score.toFixed(3)})`
      : null;
  const culprits = asVictim.slice(0, 3).map((r) => ({ pod: r.suspect, score: r.score }));
  const lines = detail ? measuredLines(detail) : [];

  if (mapPod.status === "down") {
    return {
      severity: "crit",
      dimension: "node",
      dimHealth: 0,
      headline: `${pod} 가 down 상태입니다`,
      detail: `${detail?.summary ?? ""}${mapPod.issues?.length ? ` · issues: ${mapPod.issues.join(", ")}` : ""}`.replace(/^ · /, ""),
      ebpf: [
        "node-map status=down (control-plane 판정)",
        ...(mapPod.no_data ? [`no_data${mapPod.no_data_reason ? ` (${mapPod.no_data_reason})` : ""} — 텔레메트리 없음`] : []),
        ...lines,
      ],
      signalSource: "control-plane",
      culprits: [],
      chain: null,
      action: "파드 이벤트/재시작 사유(kubectl describe) 확인 · 재스케줄 여부 점검",
      confidence: 0.9,
    };
  }

  if (!podHasTelemetry(detail) && mapPod.status !== "warning") return null;

  const h = detail?.health ?? {};
  const worstKey = (["cpu", "memory", "network"] as const)
    .filter((k) => h[k] != null)
    .sort((a, b) => (h[a] ?? 1) - (h[b] ?? 1))[0];
  const alert = firing[0];

  if (mapPod.status === "warning") {
    const dimension = alert ? alertDim(alert.alertname) : dimFromApi(worstKey);
    return {
      severity: "warn",
      dimension,
      dimHealth: r2(worstKey ? (h[worstKey] ?? 1) : 1),
      headline: alert ? (alert.title ?? alert.alertname) : `${pod} 경고 — ${mapPod.issues?.join(", ") ?? "백엔드 판정"}`,
      detail: [alert?.summary, detail?.summary].filter(Boolean).join(". "),
      ebpf: [...(mapPod.issues?.length ? [`issues: ${mapPod.issues.join(", ")}`] : []), ...lines],
      signalSource: "ebpf",
      culprits,
      chain,
      action: DIM_ACTION[dimension],
      confidence: 0.8,
    };
  }

  const worstV = worstKey ? (h[worstKey] ?? 1) : 1;
  const low = worstV < 0.6;
  return {
    severity: "ok",
    dimension: dimFromApi(worstKey),
    dimHealth: r2(worstV),
    headline: asSuspect[0] ? "실장애는 없으나 인접 파드에 간섭을 유발합니다" : "이 파드에서 실장애·이상 사건이 관측되지 않습니다",
    detail: detail?.summary ?? "",
    ebpf: low ? lines : [],
    signalSource: "ebpf",
    culprits: [],
    chain,
    action: low ? `추세 관찰 — ${DIM_ACTION[dimFromApi(worstKey)]}` : "정기 모니터링 유지",
    confidence: 0.8,
  };
}

function alertDim(alertname: string) {
  const a = alertname.toLowerCase();
  if (a.includes("latency")) return "latency" as const;
  if (a.includes("drop") || a.includes("retrans") || a.includes("net")) return "net" as const;
  if (a.includes("memory") || a.includes("oom")) return "mem" as const;
  if (a.includes("cpu") || a.includes("throttl")) return "cpu" as const;
  if (a.includes("error")) return "errors" as const;
  return "node" as const;
}

/** 파드 RX/TX — /bandwidth 파드 엔트리 (Mbps) */
export function podBandwidth(bw: BandwidthResponse | undefined, namespace: string, pod: string) {
  const p = bw?.pods.find((x) => x.pod === pod && x.namespace === namespace);
  const nic = bw?.nodes[0];
  if (!p) return null;
  const toMbps = (bps: number) => Math.round(((bps * 8) / 1e6) * 100) / 100;
  return {
    rxMbps: toMbps(p.rx_bytes_per_sec),
    txMbps: toMbps(p.tx_bytes_per_sec),
    rxText: fmtRate(p.rx_bytes_per_sec),
    txText: fmtRate(p.tx_bytes_per_sec),
    // NIC capacity 대비 파드 사용률 (%)
    nicPct: nic?.nic_capacity_bytes_per_sec ? ((p.rx_bytes_per_sec + p.tx_bytes_per_sec) / nic.nic_capacity_bytes_per_sec) * 100 : null,
  };
}

/** 파드 송신(send-path) 단계 지연 — scope=pod. 수신 경로는 백엔드가 pod 입도로 수집하지 않을 수 있음 */
export function toPodStages(egress: LatencyBreakdownResponse | undefined, ingress: LatencyBreakdownResponse | undefined, namespace: string, pod: string) {
  const pick = (res: LatencyBreakdownResponse | undefined) =>
    res ? { ...res, targets: res.targets.filter((t) => t.pod === pod && (!t.namespace || t.namespace === namespace)) } : undefined;
  return { tx: toStages(pick(egress), TX_ORDER), rx: toStages(pick(ingress), RX_ORDER) };
}

/** 워크로드 단위 drop/retrans → 이 파드가 속한 워크로드의 카테고리별 합 */
export function toPodDrops(drops: DropsResponse | undefined, namespace: string, pod: string): ScoreItem[] {
  if (!drops) return [];
  const dropWl = matchWorkload([...new Set(drops.drops.filter((d) => d.namespace === namespace).map((d) => d.workload))], pod);
  const retransWl = matchWorkload([...new Set(drops.retrans.filter((d) => d.namespace === namespace).map((d) => d.workload))], pod);
  const mine = drops.drops.filter((d) => d.namespace === namespace && d.workload === dropWl);
  const cat = (c: string) => r2(mine.filter((d) => (d.category === "policy" || d.category === "queue" ? d.category : "unknown") === c).reduce((s, d) => s + d.drops_per_sec, 0));
  const retrans = r2(drops.retrans.filter((d) => d.namespace === namespace && d.workload === retransWl).reduce((s, d) => s + d.retrans_per_sec, 0));
  return [
    { label: "drop policy", value: cat("policy") },
    { label: "drop queue", value: cat("queue") },
    { label: "drop unknown", value: cat("unknown") },
    { label: "retrans", value: retrans },
  ];
}

/** gpu-status 디바이스별 pods 역인덱스 → 파드 관점 GPU 사용 (GPU 노드가 아니면 null) */
export function toPodGpuUsage(status: GpuStatusResponse | undefined, namespace: string, pod: string): PodGpuUsage | null {
  if (!status) return null;
  const perPodAvailable = status.devices.some((d) => d.pod_attribution.available);
  if (!perPodAvailable) return { perPodAvailable: false, entries: [] };
  const entries = status.devices.flatMap((d) =>
    d.pods
      .filter((p) => p.pod === pod && p.namespace === namespace)
      .map((p) => ({
        deviceName: `gpu=${d.gpu_index}`,
        deviceIndex: Number(d.gpu_index),
        smUtil: (p.utilization_percent ?? 0) / 100,
        memMB: Math.round(p.memory_used_bytes / 1024 / 1024),
        memTotalMB: Math.round((d.memory_total_bytes ?? 0) / 1024 / 1024),
        command: "",
        type: "C" as const,
        launchRate: 0,
      })),
  );
  return { perPodAvailable: true, entries: entries.sort((a, b) => b.memMB - a.memMB) };
}
