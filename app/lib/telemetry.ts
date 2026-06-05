// ---------------------------------------------------------------------------
// Phase-1 (eBPF core) telemetry domain model.
//
// Shapes mirror what we ultimately want from the eBPF agent / Prometheus /
// Hubble. Mock generators in `mock-telemetry.ts` produce these exact shapes so
// swapping in a real fetch is the only change required on the UI side.
// ---------------------------------------------------------------------------

/** Rolling window for all time-series, in minutes, sampled once per minute. */
export const WINDOW_MINUTES = 30;

export interface TimePoint {
  t: number; // unix seconds
  v: number;
}

export interface Series {
  key: string;
  label: string;
  color: string;
  points: TimePoint[];
}

// --- network latency (feature 1) -------------------------------------------

/** eBPF tracepoints along the RX→app→TX packet path. */
export type StageKey = "nic_rx" | "netstack" | "sockq" | "app" | "qdisc_tx" | "nic_tx";

export interface StageMeta {
  key: StageKey;
  label: string;
  color: string;
}

export const LATENCY_STAGES: StageMeta[] = [
  { key: "nic_rx", label: "NIC RX", color: "#38bdf8" }, // netif_receive_skb
  { key: "netstack", label: "Net stack", color: "#818cf8" }, // ip_rcv → tcp_v4_rcv
  { key: "sockq", label: "Socket queue", color: "#a78bfa" }, // sk_receive
  { key: "app", label: "App", color: "#34d399" }, // userspace handling
  { key: "qdisc_tx", label: "qdisc TX", color: "#fbbf24" }, // __dev_queue_xmit
  { key: "nic_tx", label: "NIC TX", color: "#fb7185" }, // dev_hard_start_xmit
];

/** Cluster-aggregate latency broken down by kernel stage at one instant (ms). */
export interface LatencyStagePoint {
  t: number;
  stages: Record<StageKey, number>;
  total: number;
}

export interface PodLatencySeries {
  uid: string;
  pod: string;
  node: string;
  namespace: string;
  /** total latency (ms) over the window */
  points: TimePoint[];
  /** current per-stage breakdown (ms) */
  stages: Record<StageKey, number>;
  p50: number;
  p95: number;
  p99: number;
}

export interface LatencyData {
  /** cluster-aggregate stage breakdown over time (for the stacked area) */
  stageSeries: LatencyStagePoint[];
  /** cluster p50/p95/p99 over time */
  percentiles: { t: number; p50: number; p95: number; p99: number }[];
  /** per-pod latency series (for the heatmap + per-pod drill-down) */
  pods: PodLatencySeries[];
  /** distribution of recent per-pod totals (for the histogram) */
  histogramSamples: number[];
}

// --- packet drops (feature 2) ----------------------------------------------

export interface DropReason {
  code: string; // SKB_DROP_REASON_*
  label: string;
  desc: string;
  color: string;
}

/** Subset of Linux skb drop reasons, mapped to human-readable causes. */
export const DROP_REASONS: DropReason[] = [
  { code: "SKB_DROP_REASON_NO_SOCKET", label: "NO_SOCKET", desc: "수신 소켓 없음 — 닫힌 포트로 도착", color: "#f43f5e" },
  { code: "SKB_DROP_REASON_TCP_CSUM", label: "TCP_CSUM", desc: "TCP 체크섬 오류 — 손상된 세그먼트", color: "#fb7185" },
  { code: "SKB_DROP_REASON_NETFILTER_DROP", label: "NETFILTER_DROP", desc: "iptables/nftables 정책에 의한 차단", color: "#fbbf24" },
  { code: "SKB_DROP_REASON_QDISC_DROP", label: "QDISC_DROP", desc: "송신 큐(qdisc) 포화로 폐기", color: "#f59e0b" },
  { code: "SKB_DROP_REASON_CPU_BACKLOG", label: "CPU_BACKLOG", desc: "per-CPU backlog 큐 초과", color: "#a78bfa" },
  { code: "SKB_DROP_REASON_SOCKET_RCVBUFF", label: "SOCKET_RCVBUFF", desc: "소켓 수신 버퍼 초과", color: "#818cf8" },
  { code: "SKB_DROP_REASON_TCP_OLD_DATA", label: "TCP_OLD_DATA", desc: "재전송/오래된 데이터 — 윈도우 밖", color: "#38bdf8" },
];

export const DROP_REASON_BY_CODE: Record<string, DropReason> = Object.fromEntries(
  DROP_REASONS.map((r) => [r.code, r]),
);

export interface DropEvent {
  id: string;
  t: number;
  node: string;
  uid: string; // pod uid
  pod: string;
  namespace: string;
  reason: string; // DropReason.code
  srcIP: string;
  dstIP: string;
  count: number;
}

export interface DropData {
  events: DropEvent[];
  /** minute-aligned bucket starts spanning the window */
  buckets: number[];
}

// --- pure aggregation / math helpers ---------------------------------------

export function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx];
}

export interface HistogramBucket {
  x0: number;
  x1: number;
  count: number;
}

export function histogramBuckets(values: number[], bucketCount = 20): HistogramBucket[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = span / bucketCount;
  const buckets: HistogramBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    let i = Math.floor((v - min) / width);
    if (i >= bucketCount) i = bucketCount - 1;
    if (i < 0) i = 0;
    buckets[i].count++;
  }
  return buckets;
}

export interface Counted {
  key: string;
  count: number;
}

export function dropsByReason(events: DropEvent[]): Counted[] {
  const m = new Map<string, number>();
  for (const e of events) m.set(e.reason, (m.get(e.reason) ?? 0) + e.count);
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

export function dropsByPod(events: DropEvent[]): (Counted & { uid: string; namespace: string; node: string })[] {
  const m = new Map<string, { count: number; uid: string; namespace: string; node: string; pod: string }>();
  for (const e of events) {
    const cur = m.get(e.uid) ?? { count: 0, uid: e.uid, namespace: e.namespace, node: e.node, pod: e.pod };
    cur.count += e.count;
    m.set(e.uid, cur);
  }
  return [...m.values()]
    .map((x) => ({ key: x.pod, count: x.count, uid: x.uid, namespace: x.namespace, node: x.node }))
    .sort((a, b) => b.count - a.count);
}

/** Total drop count per minute bucket, summed across all reasons. */
export function dropsByBucket(events: DropEvent[], buckets: number[]): TimePoint[] {
  const counts = new Array(buckets.length).fill(0);
  const step = buckets.length > 1 ? buckets[1] - buckets[0] : 60;
  for (const e of events) {
    let i = Math.floor((e.t - buckets[0]) / step);
    if (i < 0) i = 0;
    if (i >= buckets.length) i = buckets.length - 1;
    counts[i] += e.count;
  }
  return buckets.map((t, i) => ({ t, v: counts[i] }));
}

export function formatMs(ms: number): string {
  if (ms >= 1) return `${ms.toFixed(ms >= 10 ? 0 : 1)} ms`;
  return `${(ms * 1000).toFixed(0)} µs`;
}

// --- workload interference (features 3 · 4 · 5) ----------------------------

export type ContribKey = "cpu" | "mem" | "net" | "pcie";

export interface ContribMeta {
  key: ContribKey;
  label: string;
  color: string;
}

/** What a pod's interference score is composed of (resource contention axes). */
export const INTERFERENCE_CONTRIB: ContribMeta[] = [
  { key: "cpu", label: "CPU", color: "#38bdf8" },
  { key: "mem", label: "Memory", color: "#a78bfa" },
  { key: "net", label: "Network", color: "#34d399" },
  { key: "pcie", label: "PCIe", color: "#fbbf24" },
];

export interface InterferenceScore {
  uid: string;
  pod: string;
  node: string;
  namespace: string;
  /** 0–100 overall interference (noisy-neighbor) score */
  score: number;
  /** per-axis contribution, summing to ≈score */
  contrib: Record<ContribKey, number>;
  /** score over the window */
  series: TimePoint[];
}

export interface CorrelationMatrix {
  entities: { uid: string; label: string }[];
  /** r[i][j] = Pearson correlation in [-1, 1] */
  r: number[][];
}

export interface ImpactEdge {
  from: string; // cause uid
  to: string; // affected uid
  weight: number; // 0–1
}

export interface InterferenceData {
  pods: InterferenceScore[];
  correlation: CorrelationMatrix;
  impact: ImpactEdge[];
}

// --- GPU integrated interference (feature 6) -------------------------------

/** How a GPU's wall-clock time is spent — why it idles. */
export type GpuStateKey = "busy" | "pcieWait" | "netWait" | "idle";

export interface GpuStateMeta {
  key: GpuStateKey;
  label: string;
  color: string;
}

export const GPU_STATES: GpuStateMeta[] = [
  { key: "busy", label: "Busy (compute)", color: "#34d399" },
  { key: "pcieWait", label: "PCIe wait", color: "#fbbf24" },
  { key: "netWait", label: "TCP/net wait", color: "#f43f5e" },
  { key: "idle", label: "Idle", color: "#3f3f46" },
];

export interface GpuBreakdownPoint {
  t: number;
  stages: Record<GpuStateKey, number>; // percentages summing to 100
}

export interface GpuDevice {
  id: string;
  node: string;
  index: number;
  model: string;
  uuid: string;
  memTotalMi: number;
  powerLimitW: number;
  util: TimePoint[]; // %
  mem: TimePoint[]; // Mi used
  temp: TimePoint[]; // °C
  power: TimePoint[]; // W
  pcie: TimePoint[]; // % of PCIe bandwidth occupied
  tcpRetrans: TimePoint[]; // retransmits / s on the node
  breakdown: GpuBreakdownPoint[];
}

export interface GpuData {
  devices: GpuDevice[];
}

export function lastV(series: TimePoint[]): number {
  return series.length ? series[series.length - 1].v : 0;
}

export function avgV(series: TimePoint[]): number {
  return series.length ? series.reduce((s, p) => s + p.v, 0) / series.length : 0;
}

export function formatW(w: number): string {
  return `${Math.round(w)} W`;
}

/** Pearson correlation coefficient of two equal-length series. */
export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  const denom = Math.sqrt(va * vb);
  return denom === 0 ? 0 : cov / denom;
}
