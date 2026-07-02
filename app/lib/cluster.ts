// ───────────────────────────────────────────────────────────────────────────
// 클러스터 데이터 & 이상탐지 로직 (맵/상세 페이지 공용, 순수 모듈)
// ───────────────────────────────────────────────────────────────────────────

export type NodeRole = "control-plane" | "worker";
export type NodeStatus = "ready" | "warning" | "down";

export type Pod = {
  name: string;
  cpu: number; // 0..100, -1 = no data
  mem: number;
  net: number;
};

export type ClusterNode = {
  name: string;
  role: NodeRole;
  status: NodeStatus;
  gpu?: boolean; // GPU 노드 여부
  pods: Pod[];
};

export type FillKey = "anomaly" | "cpu" | "mem" | "net";
export type Severity = "warn" | "crit";
export type AnomalyKind = "cpu" | "mem" | "net" | "latency" | "errors" | "node";

export type Anomaly = {
  sev: Severity;
  kind: AnomalyKind;
  headline: string; // 무엇이 이상한가
  ebpf: string[]; // 원인 신호 (source에 따라 eBPF 관측 / control-plane)
  action: string; // 다음 조치
  source?: "ebpf" | "control-plane"; // 신호 출처 (기본 ebpf)
};

// ── 데이터 ───────────────────────────────────────────────────────────────────

// 결정적 jitter (SSR 하이드레이션 안정성을 위해 Math.random 미사용)
const JIT_CPU = [0, 9, -6, 14, -11, 5, -14, 10, 3, -8, 17, -4, 7, -12, 12, -2, 6, -9, 13, -5];
const JIT_MEM = [4, -9, 12, -6, 15, -3, 8, -12, 5, -10, 2, -7, 11, -4, 9, -14, 3, -8, 10, -6];
const JIT_NET = [-3, 11, 2, -8, 18, -5, 9, -11, 6, 1, -7, 14, -2, 8, -13, 4, -6, 12, -4, 7];

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function makePods(prefix: string, count: number, c: number, m: number, n: number, noData: number[] = []): Pod[] {
  return Array.from({ length: count }, (_, i): Pod => {
    const name = `${prefix}-${String(i + 1).padStart(2, "0")}`;
    if (noData.includes(i)) return { name, cpu: -1, mem: -1, net: -1 };
    return {
      name,
      cpu: clamp(c + JIT_CPU[i % JIT_CPU.length], 3, 99),
      mem: clamp(m + JIT_MEM[i % JIT_MEM.length], 5, 98),
      net: clamp(n + JIT_NET[i % JIT_NET.length], 2, 97),
    };
  });
}

export const NODES: ClusterNode[] = [
  { name: "cp-01", role: "control-plane", status: "ready", pods: makePods("kube-system", 18, 30, 42, 25, [5, 12]) },
  { name: "gpu-01", role: "worker", status: "warning", gpu: true, pods: makePods("app-a", 24, 44, 55, 38, [7, 19]) },
  { name: "gpu-02", role: "worker", status: "warning", gpu: true, pods: makePods("app-b", 30, 51, 84, 40, [3, 14, 22]) },
  { name: "worker-03", role: "worker", status: "warning", pods: makePods("app-c", 16, 38, 40, 62, [9]) },
  { name: "worker-04", role: "worker", status: "down", pods: makePods("app-d", 12, 0, 0, 0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) },
  { name: "gpu-03", role: "worker", status: "ready", gpu: true, pods: makePods("app-e", 21, 40, 50, 35, [4, 16]) },
  { name: "worker-06", role: "worker", status: "ready", pods: makePods("app-f", 14, 27, 33, 30) },
  { name: "worker-07", role: "worker", status: "ready", pods: makePods("app-g", 9, 35, 48, 28) },
  { name: "worker-08", role: "worker", status: "ready", pods: makePods("app-h", 6, 41, 50, 33) },
  { name: "worker-09", role: "worker", status: "ready", pods: makePods("app-i", 3, 22, 30, 20) },
  { name: "worker-10", role: "worker", status: "warning", pods: makePods("app-j", 19, 48, 56, 44, [6, 13]) },
  { name: "worker-11", role: "worker", status: "warning", pods: makePods("app-k", 15, 40, 58, 45, [2, 9]) },
  { name: "worker-12", role: "worker", status: "ready", pods: makePods("app-l", 11, 33, 40, 31) },
  { name: "worker-13", role: "worker", status: "ready", pods: makePods("app-m", 8, 39, 46, 36) },
  { name: "worker-14", role: "worker", status: "ready", pods: makePods("app-n", 5, 29, 36, 26) },
  { name: "worker-15", role: "worker", status: "ready", pods: makePods("app-o", 4, 44, 52, 39) },
  { name: "worker-16", role: "worker", status: "ready", pods: makePods("app-p", 2, 20, 28, 22) },
];

export const ORDERED = [...NODES].sort((a, b) => b.pods.length - a.pods.length);

// 이상은 "사용률"이 아니라 별도 신호로 정의 — 사용률이 낮아도 이상일 수 있음.
export const ANOMALIES: Record<string, Anomaly> = {
  "app-b-07": {
    sev: "crit",
    kind: "errors",
    headline: "HTTP 5xx 급증 (6.8%)",
    ebpf: ["uprobe: 응답 status≥500 6.8% (정상 0.2%)", "go runtime: panic recover 142건/분", "downstream payments-api 연결 거부 31%"],
    action: "payments-api 의존성 점검 · 최근 배포 롤백 검토",
  },
  "app-c-04": {
    sev: "crit",
    kind: "net",
    headline: "TCP 재전송 폭증 (CPU는 정상)",
    ebpf: ["kprobe tcp_retransmit_skb: 148 retrans/s", "p99 RTT 380ms (baseline 12ms)", "SYN 재시도 22%, RST 수신 증가"],
    action: "노드 NIC/CNI 상태 및 대상 서비스 네트워크 정책 확인",
  },
  "app-c-11": {
    sev: "warn",
    kind: "net",
    headline: "패킷 드롭 상승",
    ebpf: ["tracepoint skb:kfree_skb 39/s", "conntrack 테이블 사용률 88%"],
    action: "conntrack 한도 및 동시연결 수 확인",
  },
  "app-k-05": {
    sev: "crit",
    kind: "mem",
    headline: "메모리 압박 · OOM 임박",
    ebpf: ["RSS 1.94GB / limit 2GB (97%)", "major page fault 1.2k/s", "오프힙 할당 급증, GC pause 210ms"],
    action: "메모리 누수 프로파일 · limit 상향 또는 replica 증설",
  },
  "app-a-11": {
    sev: "warn",
    kind: "latency",
    headline: "요청 지연 상승 (p99)",
    ebpf: ["off-CPU 분석: futex 대기 64%", "runqueue latency 18ms", "DB 커넥션 풀 대기 증가"],
    action: "락 경합/커넥션 풀 크기 점검",
  },
  "app-e-15": {
    sev: "crit",
    kind: "cpu",
    headline: "CPU 스로틀링 심각",
    ebpf: ["cgroup cpu.stat throttled 41%", "runqueue latency 27ms", "핫패스: json.Marshal 38% on-CPU"],
    action: "CPU limit 상향 또는 직렬화 경로 최적화",
  },
  "app-j-08": {
    sev: "warn",
    kind: "cpu",
    headline: "CPU 스로틀 경고",
    ebpf: ["cgroup throttled 16%", "주기적 burst 패턴 관측"],
    action: "limit/quota 여유 확인",
  },
  "app-b-18": {
    sev: "warn",
    kind: "errors",
    headline: "gRPC 에러율 상승",
    ebpf: ["uprobe: gRPC code=UNAVAILABLE 2.4%", "재시도 폭주로 부하 증폭"],
    action: "백오프 정책 및 업스트림 상태 확인",
  },
};

export function nodeDownAnomaly(node: ClusterNode): Anomaly {
  return {
    sev: "crit",
    kind: "node",
    headline: `${node.name} NotReady`,
    // 노드 다운 = eBPF agent도 함께 다운 → eBPF 텔레메트리 없음. control-plane 신호로만 감지.
    ebpf: [
      "kubelet NotReady · node heartbeat 90s 누락",
      "eBPF agent(netobs/gpuobs) scrape target DOWN → 텔레메트리 수집 중단",
      "컨테이너 런타임 응답 없음 (CRI timeout)",
    ],
    action: "노드 상태/네트워크 점검 · 파드 재스케줄 확인",
    source: "control-plane",
  };
}

export function podAnomaly(node: ClusterNode, pod: Pod): Anomaly | null {
  if (pod.cpu < 0) return node.status === "down" ? nodeDownAnomaly(node) : null;
  return ANOMALIES[pod.name] ?? null;
}

// ── 조회 ─────────────────────────────────────────────────────────────────────

export function getNode(name: string): ClusterNode | undefined {
  return NODES.find((n) => n.name === name);
}

export function getPod(name: string): { node: ClusterNode; pod: Pod } | undefined {
  for (const node of NODES) {
    const pod = node.pods.find((p) => p.name === name);
    if (pod) return { node, pod };
  }
  return undefined;
}

export function nodeStats(node: ClusterNode) {
  const live = node.pods.filter((p) => p.cpu >= 0);
  const avg = (sel: (p: Pod) => number) =>
    live.length ? Math.round(live.reduce((s, p) => s + sel(p), 0) / live.length) : -1;
  const anomalies = node.pods
    .map((pod) => ({ pod, a: podAnomaly(node, pod) }))
    .filter((x): x is { pod: Pod; a: Anomaly } => x.a !== null);
  return {
    cpu: avg((p) => p.cpu),
    mem: avg((p) => p.mem),
    net: avg((p) => p.net),
    crit: anomalies.filter((x) => x.a.sev === "crit").length,
    warn: anomalies.filter((x) => x.a.sev === "warn").length,
    noData: node.pods.length - live.length,
    anomalies,
  };
}

// ── 색 / 토큰 ─────────────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const RAMP: [number, string][] = [
  [0, "#5bb85b"],
  [50, "#e9c64a"],
  [75, "#e8923b"],
  [100, "#dc4a3d"],
];

export const C_CALM = "#e4ebe6"; // 정상
export const C_WARN = "#f0a93b"; // 경고
export const C_CRIT = "#e0473a"; // 심각
export const C_NODATA = "#eceff1"; // 데이터 없음

export function rampColor(v: number) {
  if (v < 0) return C_NODATA;
  const x = clamp(v, 0, 100);
  for (let i = 1; i < RAMP.length; i++) {
    const [p0, c0] = RAMP[i - 1];
    const [p1, c1] = RAMP[i];
    if (x <= p1) {
      const t = (x - p0) / (p1 - p0);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      const ch = (k: "r" | "g" | "b") => Math.round(a[k] + (b[k] - a[k]) * t);
      return `rgb(${ch("r")}, ${ch("g")}, ${ch("b")})`;
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export const RAMP_CSS = `linear-gradient(90deg, ${RAMP.map(([, c]) => c).join(", ")})`;

export const SEV_TONE: Record<Severity, { fill: string; stroke: string; text: string; bg: string; label: string }> = {
  warn: { fill: C_WARN, stroke: "#b45309", text: "#92400e", bg: "#fffbeb", label: "Warning" },
  crit: { fill: C_CRIT, stroke: "#b91c1c", text: "#991b1b", bg: "#fef2f2", label: "Critical" },
};

export const STATUS_DOT: Record<NodeStatus, string> = {
  ready: "#10b981",
  warning: "#f59e0b",
  down: "#ef4444",
};

export const STATUS_LABEL: Record<NodeStatus, string> = {
  ready: "Ready",
  warning: "Warning",
  down: "Down",
};

// 헤더에 표기하는 노드 상태 — 진단 severity 와 항상 일치시킨다.
// severity 는 실신호(노드 status + 카탈로그된 ANOMALIES)로만 산정되므로,
// "노드에 떠 있는 실제 사건의 최악 심각도"가 헤더와 진단 메시지에 동일하게 나온다.
// down 만 별도 라벨(텔레메트리 관측 불가)로 유지.
export type NodeDisplayStatus = "ok" | "warn" | "crit" | "down";

export function nodeDisplayStatus(node: ClusterNode): NodeDisplayStatus {
  if (node.status === "down") return "down";
  return nodeDiagnosis(node).severity; // "ok" | "warn" | "crit" — 실신호 기반
}

export const DISPLAY_STATUS_TONE: Record<NodeDisplayStatus, { dot: string; label: string }> = {
  ok: { dot: "#10b981", label: "정상" },
  warn: { dot: C_WARN, label: "경고" },
  crit: { dot: C_CRIT, label: "심각" },
  down: { dot: "#ef4444", label: "Down" },
};

export const KIND_LABEL: Record<AnomalyKind, string> = {
  cpu: "CPU", mem: "Memory", net: "Network", latency: "Latency", errors: "Errors", node: "Node",
};

export const FILL_LABEL: Record<FillKey, string> = {
  anomaly: "Anomaly", cpu: "CPU", mem: "Memory", net: "Network",
};
export const FILL_ORDER: FillKey[] = ["anomaly", "cpu", "mem", "net"];
export const METRIC_GET: Record<Exclude<FillKey, "anomaly">, (p: Pod) => number> = {
  cpu: (p) => p.cpu, mem: (p) => p.mem, net: (p) => p.net,
};

export const HEX_CLIP = "[clip-path:polygon(25%_0,75%_0,100%_50%,75%_100%,25%_100%,0%_50%)]";

// ───────────────────────────────────────────────────────────────────────────
// 드릴다운 분석 — eBPF 신호 기반 (노드/파드 원인 규명)
// ───────────────────────────────────────────────────────────────────────────

// eBPF 네트워크 TX(송신) 경로 단계 (커널 → veth)
export const STAGES = ["sendmsg_ret", "tcp_transmit_skb", "tcp_write_xmit", "to_devq", "to_veth"];
// eBPF 네트워크 RX(수신) 경로 단계 (NIC → 앱)
export const RX_STAGES = ["rcv_demux", "rcv_established", "rcv_app"];
const DROP_CATS = ["drop policy", "drop queue", "drop unknown", "retrans"];

// 결정적 해시 (Math.random 미사용 — SSR 안정)
function strHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export type PodAnalytics = {
  throttle: number; // cpu_throttle_score 0..1
  memPressure: number; // memory_pressure_score 0..1
  rx: number; // Mbps
  tx: number; // Mbps
  drops: { category: string; rate: number }[]; // /s
  stages: { stage: string; p99: number }[]; // TX 경로 µs
  bottleneck: string; // TX 최대 지연 단계
  rxStages: { stage: string; p99: number }[]; // RX 경로 µs
  rxBottleneck: string; // RX 최대 지연 단계
};

export function podAnalytics(node: ClusterNode, pod: Pod): PodAnalytics {
  if (pod.cpu < 0) {
    return {
      throttle: 0,
      memPressure: 0,
      rx: 0,
      tx: 0,
      drops: DROP_CATS.map((c) => ({ category: c, rate: 0 })),
      stages: STAGES.map((s) => ({ stage: s, p99: 0 })),
      bottleneck: STAGES[0],
      rxStages: RX_STAGES.map((s) => ({ stage: s, p99: 0 })),
      rxBottleneck: RX_STAGES[0],
    };
  }

  const h = strHash(pod.name);
  const a = podAnomaly(node, pod);
  const netF = pod.net / 100;

  let throttle = clamp((pod.cpu / 100) * 0.6 + (h % 20) / 100, 0, 1);
  let memPressure = clamp((pod.mem / 100) * 0.7 + (h % 15) / 120, 0, 1);
  if (a?.kind === "cpu") throttle = clamp(0.62 + (h % 28) / 100, 0, 1);
  if (a?.kind === "mem") memPressure = clamp(0.72 + (h % 24) / 100, 0, 1);

  const baseP = [40, 70, 110, 160, 210];
  const stages = STAGES.map((s, i) => ({
    stage: s,
    p99: Math.round(baseP[i] * (0.6 + netF * 0.8) + (strHash(pod.name + i) % 45)),
  }));
  if (a?.kind === "net") {
    stages[3].p99 = Math.round(stages[3].p99 * 3.2);
    stages[4].p99 = Math.round(stages[4].p99 * 2.6);
  }
  if (a?.kind === "latency") {
    stages[2].p99 = Math.round(stages[2].p99 * 2.9);
    stages[3].p99 = Math.round(stages[3].p99 * 1.7);
  }
  const bottleneck = stages.reduce((m, s) => (s.p99 > m.p99 ? s : m)).stage;

  // RX(수신) 경로 단계 지연 — demux → established → app 전달
  const baseRx = [50, 95, 150];
  const rxStages = RX_STAGES.map((s, i) => ({
    stage: s,
    p99: Math.round(baseRx[i] * (0.6 + netF * 0.8) + (strHash(pod.name + "rx" + i) % 40)),
  }));
  if (a?.kind === "net") rxStages[2].p99 = Math.round(rxStages[2].p99 * 2.4); // 앱 전달 정체
  if (a?.kind === "latency") rxStages[1].p99 = Math.round(rxStages[1].p99 * 2.3); // established 처리 지연
  const rxBottleneck = rxStages.reduce((m, s) => (s.p99 > m.p99 ? s : m)).stage;

  const dropBase = Math.round(netF * 26);
  let drops = [
    { category: "drop policy", rate: h % 4 },
    { category: "drop queue", rate: dropBase + (h % 9) },
    { category: "drop unknown", rate: h % 3 },
    { category: "retrans", rate: Math.round(dropBase * 1.3) + (h % 5) },
  ];
  if (a?.kind === "net") {
    drops = drops.map((d) => ({
      ...d,
      rate: d.rate * (d.category === "retrans" || d.category === "drop queue" ? 6 : 2),
    }));
  }

  const rx = Math.round(netF * 760 + (h % 220));
  const tx = Math.round(netF * 480 + (h % 160));
  return { throttle: r2(throttle), memPressure: r2(memPressure), rx, tx, drops, stages, bottleneck, rxStages, rxBottleneck };
}

// 파드 차원별 health (노드 health 와 동일 스케일, gpu 는 파드 단위로 의미 없어 null)
export function podHealth(node: ClusterNode, pod: Pod): NodeHealth {
  if (pod.cpu < 0) return { cpu: 0, net: 0, mem: 0, gpu: null };
  const a = podAnalytics(node, pod);
  const dropSum = a.drops.reduce((s, d) => s + d.rate, 0);
  return {
    cpu: r2(clamp(1 - a.throttle, 0, 1)),
    mem: r2(clamp(1 - a.memPressure, 0, 1)),
    net: r2(clamp(1 - dropSum / 120, 0, 1)),
    gpu: null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// netobs-agent (네트워크 eBPF agent) — self-health & 워크로드 단위 네트워크 신호
// ───────────────────────────────────────────────────────────────────────────

// netobs-agent kprobe/tracepoint 부착 대상 (BPF program attach status)
const NETOBS_BPF_PROGRAMS = [
  "__dev_queue_xmit", "__netif_receive_skb", "__tcp_transmit_skb", "__tcp_transmit_skb_ret",
  "kfree_skb_reason", "tcp_cleanup_rbuf", "tcp_rcv_established", "tcp_recvmsg",
  "tcp_retransmit_skb", "tcp_sendmsg", "tcp_sendmsg_ret", "tcp_v4_do_rcv", "tcp_v4_rcv",
  "tcp_v6_do_rcv", "tcp_v6_rcv", "tcp_write_xmit", "tcp_write_xmit_ret", "udp_recvmsg",
  "udp_sendmsg", "udpv6_recvmsg", "udpv6_sendmsg", "veth_xmit",
];
// BPF map 사용률 측정 대상
const NETOBS_BPF_MAPS = ["flow_bytes", "netobs_drop_stacks", "pod_bytes", "starts"];
// attach 재시도 압력 분류 (retry pressure by reason, #105)
const NETOBS_RETRY_REASONS = [
  "btf_missing", "kernel_version_mismatch", "link_internal_error",
  "permission_denied", "symbol_not_found", "verifier_rejected", "other",
];
// drop reason → category 매핑 (Top drop reasons by workload 패널)
const NETOBS_DROP_REASONS: [string, string][] = [
  ["NOT_SPECIFIED", "unknown"],
  ["QUEUE_PURGE", "queue"],
  ["SKB_QUEUE_PURGE", "queue"],
  ["NETFILTER_DROP", "policy"],
  ["BPF_CGROUP_INGRESS", "policy"],
  ["NO_SOCKET", "unknown"],
  ["TCP_INVALID_SEQUENCE", "unknown"],
];

export type BpfProgram = { name: string; attached: boolean };

export type NetobsAgentHealth = {
  up: boolean;
  informerSyncLagS: number;
  programs: BpfProgram[];
  attachedCount: number;
  failedCount: number;
  ringbufDropRate: number; // events/s (ringbuf 가 가득 차 유실된 이벤트율)
  maps: { name: string; utilPct: number }[]; // BPF map utilization %
  attachResult: { success: number; failure: number }; // attach result rate /s (집계)
  retryPressure: { reason: string; rate: number }[]; // attach 재시도 압력
};

// 노드별 netobs-agent 자체 헬스 (DaemonSet 파드 1개 가정). 노드 다운 → agent 다운.
export function netobsAgentHealth(node: ClusterNode): NetobsAgentHealth {
  const up = node.status !== "down";
  const h = strHash(node.name + "netobs");
  // 다운이면 부착 불가 (verifier 가 BTF 없어 거부된 것처럼 표기), 정상이면 모두 부착.
  const programs: BpfProgram[] = NETOBS_BPF_PROGRAMS.map((name) => ({ name, attached: up }));
  const failedCount = up ? 0 : programs.length;
  const attachedCount = programs.length - failedCount;

  const maps = NETOBS_BPF_MAPS.map((name) => ({
    name,
    utilPct: up ? clamp(18 + (strHash(node.name + name) % 64), 4, 96) : 0,
  }));

  // 사용률이 높을수록 ringbuf 유실·재시도 압력 증가 (인과적으로 연결)
  const netAvg = (() => {
    const live = node.pods.filter((p) => p.cpu >= 0);
    return live.length ? live.reduce((s, p) => s + p.net, 0) / live.length / 100 : 0;
  })();
  const ringbufDropRate = up ? r2(clamp(netAvg * 3.2 + (h % 5) / 10, 0, 12)) : 0;

  const retryPressure = up
    ? NETOBS_RETRY_REASONS.map((reason) => ({
        reason,
        // 대부분 0 — 환경 따라 일부 reason 만 간헐 압력
        rate: reason === "symbol_not_found" || reason === "btf_missing" ? r3(((strHash(node.name + reason) % 6)) / 100) : 0,
      }))
    : NETOBS_RETRY_REASONS.map((reason) => ({
        reason,
        rate: reason === "btf_missing" || reason === "verifier_rejected" ? r2(0.4 + (strHash(node.name + reason) % 5) / 10) : 0,
      }));

  return {
    up,
    informerSyncLagS: up ? r2((h % 26) / 10) : 0,
    programs,
    attachedCount,
    failedCount,
    ringbufDropRate,
    maps,
    attachResult: {
      success: up ? programs.length : 0,
      failure: up ? 0 : programs.length,
    },
    retryPressure,
  };
}

// 노드 단위 송/수신 경로 단계 지연 (live 파드 p99 평균) — Send/Receive path 패널
export type NodeStageLatency = {
  tx: { stage: string; p99: number }[];
  rx: { stage: string; p99: number }[];
  txBottleneck: string;
  rxBottleneck: string;
};
export function nodeStageLatency(node: ClusterNode): NodeStageLatency {
  const live = node.pods.filter((p) => p.cpu >= 0);
  const an = live.map((p) => podAnalytics(node, p));
  const avgAt = (sel: (a: PodAnalytics) => { p99: number }[], i: number) =>
    an.length ? Math.round(an.reduce((s, a) => s + sel(a)[i].p99, 0) / an.length) : 0;
  const tx = STAGES.map((stage, i) => ({ stage, p99: avgAt((a) => a.stages, i) }));
  const rx = RX_STAGES.map((stage, i) => ({ stage, p99: avgAt((a) => a.rxStages, i) }));
  const top = (xs: { stage: string; p99: number }[]) => xs.reduce((m, s) => (s.p99 > m.p99 ? s : m), xs[0]).stage;
  return { tx, rx, txBottleneck: top(tx), rxBottleneck: top(rx) };
}

// 워크로드별 TCP 재전송율 (events/s) — namespace/workload 단위 집계, 내림차순
export type WorkloadRate = { workload: string; node: string; rate: number };
export function nodeRetransByWorkload(node: ClusterNode): WorkloadRate[] {
  const live = node.pods.filter((p) => p.cpu >= 0);
  const rows = live.map((p) => {
    const a = podAnalytics(node, p);
    const retrans = a.drops.find((d) => d.category === "retrans")?.rate ?? 0;
    return { workload: `${p.name.replace(/-\d+$/, "")}/${p.name}`, node: node.name, rate: retrans };
  });
  return rows.filter((r) => r.rate > 0).sort((a, b) => b.rate - a.rate).slice(0, 12);
}

// 노드 단위 ip_version 별 flow bytes / drop events (IPv4·IPv6) — events·bytes per s
export type NetFlow = {
  ipv4Bytes: number; // bytes/s
  ipv6Bytes: number;
  ipv4DropRate: number; // events/s
  ipv6DropRate: number;
  allowNamespaces: boolean; // NETOBS_FLOW_ALLOW_NAMESPACES 설정 여부
};
export function nodeNetFlow(node: ClusterNode): NetFlow {
  const live = node.pods.filter((p) => p.cpu >= 0);
  const an = live.map((p) => podAnalytics(node, p));
  const totalMbps = an.reduce((s, a) => s + a.rx + a.tx, 0); // Mbps 합
  const totalBytes = Math.round((totalMbps * 1_000_000) / 8); // bytes/s
  const dropSum = an.reduce((s, a) => s + a.drops.reduce((x, d) => x + d.rate, 0), 0);
  const h = strHash(node.name + "flow");
  // IPv6 비중은 노드별로 다르게 (대개 IPv4 우세)
  const v6Frac = (8 + (h % 18)) / 100; // 8~25%
  return {
    ipv4Bytes: Math.round(totalBytes * (1 - v6Frac)),
    ipv6Bytes: Math.round(totalBytes * v6Frac),
    ipv4DropRate: r2(dropSum * (1 - v6Frac)),
    ipv6DropRate: r2(dropSum * v6Frac),
    allowNamespaces: true,
  };
}

// 워크로드별 Top drop reasons (5m rate) — drop_reason · category · namespace · workload · node
export type DropReasonRow = {
  reason: string;
  category: string;
  namespace: string;
  workload: string;
  node: string;
  rate: number; // events/s
};
export function nodeDropReasons(node: ClusterNode): DropReasonRow[] {
  const live = node.pods.filter((p) => p.cpu >= 0);
  // 드롭 상위 파드부터, 각 파드의 우세 카테고리에 맞는 reason 을 결정적으로 배정
  const ranked = live
    .map((p) => ({ p, a: podAnalytics(node, p) }))
    .map((x) => ({
      ...x,
      dropSum: x.a.drops.reduce((s, d) => s + d.rate, 0),
    }))
    .filter((x) => x.dropSum > 0)
    .sort((a, b) => b.dropSum - a.dropSum)
    .slice(0, 10);

  return ranked.map(({ p, a }) => {
    // 우세 드롭 카테고리
    const top = [...a.drops].filter((d) => d.category !== "retrans").sort((x, y) => y.rate - x.rate)[0];
    const cat = top?.category.replace("drop ", "") ?? "unknown";
    const candidates = NETOBS_DROP_REASONS.filter(([, c]) => c === cat);
    const pool = candidates.length ? candidates : NETOBS_DROP_REASONS;
    const [reason, category] = pool[strHash(p.name) % pool.length];
    return {
      reason,
      category,
      namespace: p.name.replace(/-\d+$/, ""),
      workload: p.name,
      node: node.name,
      rate: top?.rate ?? 0,
    };
  });
}

// ── GPU (GPU 노드 전용) ──────────────────────────────────────────────────────

// 디바이스 스펙 (NVIDIA GeForce RTX 3090 기준)
const GPU_MODEL = "NVIDIA GeForce RTX 3090";
const GPU_MEM_TOTAL_MB = 24576;
const GPU_POWER_LIMIT_W = 350;
const GPU_TEMP_SLOWDOWN_C = 93; // hw thermal slowdown 임계
const GPU_TEMP_SHUTDOWN_C = 98; // hw shutdown 임계
const GPU_TEMP_MAX_C = 93; // gpu_max (최대 동작 온도)

// gpuobs-agent uprobe 부착 대상 — 드라이버 API(cu*)는 부착됨, 런타임 API(cuda*)는 미부착
const CUDA_SYMBOLS_ATTACHED = [
  "cuCtxCreate_v2", "cuCtxSetCurrent", "cuEventSynchronize", "cuLaunchCooperativeKernel",
  "cuLaunchKernel", "cuLaunchKernelEx", "cuMemcpy", "cuMemcpy2DAsync_v2", "cuMemcpy2D_v2",
  "cuMemcpy3DAsync_v2", "cuMemcpy3D_v2", "cuMemcpyDtoDAsync_v2", "cuMemcpyDtoD_v2",
  "cuMemcpyDtoHAsync_v2", "cuMemcpyDtoH_v2", "cuMemcpyHtoDAsync_v2", "cuMemcpyHtoD_v2",
  "cuStreamSynchronize", "cuStreamWaitEvent",
];
const CUDA_SYMBOLS_MISSING = ["cudaLaunchKernel", "cudaMemcpy", "cudaMemcpyAsync", "cudaSetDevice"];

// 런타임 API(cuda*) uprobe가 부착된 노드 — 여기서만 파드/PID별 CUDA 귀속이 관측 가능.
// 그 외 GPU 노드는 드라이버 API(cu*)만 부착돼 디바이스 레벨(DCGM/NVML)만 보이고 귀속은 blind.
const CUDA_ATTRIBUTABLE_NODES = new Set(["gpu-03"]);
function cudaAttributable(node: ClusterNode): boolean {
  return node.gpu === true && node.status !== "down" && CUDA_ATTRIBUTABLE_NODES.has(node.name);
}

// NVML 호출 종류 (call duration p99 / error rate 측정 대상)
const NVML_CALLS = ["Device", "DeviceCount", "DeviceUUID", "Info", "MigMode", "ProcessUtilization", "RunningProcesses", "Snapshot"];

// 하위 탭(Processes/CUDA) 합성용 심볼 풀
const GPU_KERNELS = [
  "ampere_sgemm_128x64_nn", "ampere_sgemm_128x128_tn", "cudnn::winograd_nonfused",
  "elementwise_kernel", "softmax_warp_forward", "vectorized_layer_norm",
  "reduce_kernel", "gemv2T_kernel", "flash_fwd_kernel", "scatter_add_kernel",
];
const GPU_COMMANDS = [
  "python train.py --amp", "python -m vllm.entrypoints.api_server",
  "tritonserver --model-repo=/models", "python infer_worker.py", "python finetune_lora.py",
];

export type GpuDevice = {
  name: string; // "gpu=0"
  index: number;
  model: string;
  util: number; // SM util 0..1
  memUsedMB: number;
  memTotalMB: number;
  tempC: number;
  tempSlowdownC: number;
  tempShutdownC: number;
  tempMaxC: number;
  powerW: number;
  powerLimitW: number;
  graphicsClockMHz: number;
  hwThermalSlowdown: boolean;
  throttleReasons: string[]; // active throttle reasons (예: ["gpu_idle"])
  pcieGbs: number; // host PCIe(H2D+D2H) throughput GB/s — DCGM PROF_PCIE_TX/RX
  pcieMaxGbs: number; // 링크 상한 (PCIe 4.0 x16 ≈ 31.5)
};

const PCIE_X16_MAX_GBS = 31.5; // PCIe 4.0 x16 이론 대역폭
const NIC_X8_MAX_GBS = 15.75; // NIC 가 붙은 PCIe 4.0 x8

export type CudaSymbol = { name: string; attached: boolean };

export type GpuAgentHealth = {
  up: boolean;
  informerSyncLagS: number;
  cudaSymbols: CudaSymbol[];
  attachedCount: number;
  missingCount: number;
  nvmlP99: { call: string; ms: number }[];
  nvmlErrors: { code: string; rate: number }[]; // errors/s
};

// 교차 분석(#68)용 짧은 시계열 — thermal↔power 양의 상관, clock↔throttle 음의 상관
export type GpuSeries = {
  temp: number[];
  power: number[];
  clock: number[];
  thermalSlowdown: number[]; // 0/1
};

// ── 하위 탭 데이터 (Processes · CUDA · Memory · Interconnect · Events) ──────────
// 귀속(per-pod) 레벨: processes·cudaActivity·memSeries 는 cuda* uprobe 부착 노드에서만.
// 디바이스 레벨: interconnect·events 는 DCGM/NVML 로 항상 관측 가능.

export type GpuProcess = {
  pid: number;
  pod: string; // 소유 파드 (k8s)
  command: string; // 프로세스 커맨드
  type: "C" | "G" | "C+G"; // compute / graphics / both
  smUtil: number; // 0..1 (SM active 귀속분)
  memMB: number; // GPU 메모리 사용
};

export type CudaEventKind = "kernel" | "h2d" | "d2h" | "sync";
export type CudaEvent = {
  lane: number; // lanes 인덱스 (stream / copy engine)
  kind: CudaEventKind;
  name: string; // 커널/복사 심볼
  startMs: number; // 윈도 내 시작 (0..windowMs)
  durMs: number;
};
export type CudaActivity = {
  windowMs: number; // 타임라인 윈도 폭
  lanes: string[]; // 레인 라벨 (stream 7, stream 13, H2D, D2H …)
  events: CudaEvent[];
  launchRate: number; // kernel launches/s
  h2dMBs: number; // host→device MB/s
  d2hMBs: number; // device→host MB/s
};

export type GpuMemStack = {
  steps: number; // 시계열 길이
  totalMB: number; // 디바이스 전체 VRAM
  series: { pod: string; values: number[] }[]; // 파드별 VRAM(MB) 시계열 (stacked)
};

export type IcKind = "pcie" | "nvlink";
export type GpuIcNode = { id: string; label: string; kind: "gpu" | "cpu" | "nic"; x: number; y: number };
export type GpuIcLink = { from: string; to: string; kind: IcKind; gbs: number; maxGbs: number; label: string };
export type GpuInterconnect = {
  nodes: GpuIcNode[];
  links: GpuIcLink[];
};

export type GpuEventKind = "xid" | "ecc" | "throttle" | "powerbrake" | "info";
export type GpuEvent = {
  tSecAgo: number; // 발생 시점 (초 전)
  kind: GpuEventKind;
  severity: Severity | "info";
  code: string; // 예: "XID 79", "ECC DBE", "SW Thermal"
  text: string;
};

// idle GPU 의 우세 피딩 병목 — 전부 측정 가능한 신호에 근거.
//   pcie_saturated  : H2D/D2H 복사가 PCIe 대역폭을 포화 (DCGM PROF_PCIE_TX/RX)
//   network_stall   : 집합통신(all-reduce)이 tcp 재전송으로 블로킹 (netobs tcp_retransmit)
//   none            : idle 이나 우세 병목 없음 → 미스케줄
export type GpuIdleCause = "pcie_saturated" | "network_stall" | "none";

// 디바이스 단위 관측 묶음 — GPU 탭에서 디바이스 선택 시 이 단위로 드릴다운.
export type GpuDeviceView = {
  device: GpuDevice;
  series: GpuSeries; // 교차 분석 스파크라인
  idle: boolean;
  health: number; // 0..1
  dominantCause: GpuIdleCause;
  processes: GpuProcess[]; // 귀속 불가면 []
  cudaActivity: CudaActivity | null; // 귀속 불가면 null
  memSeries: GpuMemStack | null; // 귀속 불가면 null
  interconnect: GpuInterconnect; // 디바이스 레벨 — 항상
  events: GpuEvent[]; // 디바이스 레벨 — 항상
  verdict: GpuVerdict; // 이 디바이스의 진단 결론
};

export type GpuInfo = {
  views: GpuDeviceView[]; // 디바이스별 관측 (agent down 이면 [])
  memPods: { pod: string; memMB: number }[]; // GPU 메모리 사용 파드 (디바이스 합산)
  idle: boolean; // 노드 롤업 — 모든 디바이스가 idle
  health: number; // 노드 롤업 — 최악(min) 디바이스 health
  dominantCause: GpuIdleCause; // 노드 롤업 — 가장 심각한 idle 디바이스의 원인
  agent: GpuAgentHealth;
  perPodAvailable: boolean; // false → 파드별 CUDA 귀속 패널 "No data"
};

// 결정적 파동 [-1,1] — 인덱스별 동일 시드 → 신호 간 상관관계 보존
function gpuWave(node: string, i: number): number {
  return ((strHash(node + "wave" + i) % 200) - 100) / 100;
}

// gpuobs-agent 자체 헬스 (CUDA 심볼 부착 상태 · NVML 호출 지연/에러 · informer 동기화)
function gpuAgentHealth(node: ClusterNode, up: boolean): GpuAgentHealth {
  const h = strHash(node.name + "agent");
  // 런타임 API(cuda*)는 부착된 노드에서만 attached, 그 외엔 missing.
  const runtimeAttached = cudaAttributable(node);
  const cudaSymbols: CudaSymbol[] = [
    ...CUDA_SYMBOLS_ATTACHED.map((name) => ({ name, attached: true })),
    ...CUDA_SYMBOLS_MISSING.map((name) => ({ name, attached: runtimeAttached })),
  ];
  const nvmlP99 = NVML_CALLS.map((call) => ({
    call,
    ms: up ? r2(0.3 + (strHash(node.name + call) % 90) / 100 + (call === "Snapshot" ? 1.4 : 0)) : 0,
  }));
  const nvmlErrors = up
    ? [
        { code: "MigMode Not Supported", rate: r3(((h % 7) + 1) / 100) },
        { code: "ProcessUtilization Not Found", rate: r3(((h % 5) + 1) / 100) },
      ]
    : [];
  return {
    up,
    informerSyncLagS: up ? r2((h % 28) / 10) : 0,
    cudaSymbols,
    attachedCount: CUDA_SYMBOLS_ATTACHED.length + (runtimeAttached ? CUDA_SYMBOLS_MISSING.length : 0),
    missingCount: runtimeAttached ? 0 : CUDA_SYMBOLS_MISSING.length,
    nvmlP99,
    nvmlErrors,
  };
}

// ── 하위 탭 생성기 ───────────────────────────────────────────────────────────

// Processes — PID별 GPU 귀속 (cuda* 부착 노드에서만). 총합 ≈ 디바이스 util/mem.
function gpuProcesses(node: ClusterNode, device: GpuDevice, attributable: boolean): GpuProcess[] {
  if (!attributable) return [];
  const live = node.pods.filter((p) => p.cpu >= 0);
  if (!live.length) return [];
  const h = strHash(node.name + device.name + "proc");
  const count = clamp(2 + (h % 3), 2, Math.min(5, live.length)); // 2..4
  const chosen = [...live].sort((a, b) => strHash(b.name + device.name) - strHash(a.name + device.name)).slice(0, count);
  const weights = chosen.map((p) => 1 + (strHash(p.name + device.name + "w") % 100) / 100);
  const wsum = weights.reduce((s, v) => s + v, 0);
  return chosen
    .map((p, i) => {
      const frac = weights[i] / wsum;
      const hp = strHash(p.name + device.name + "gp");
      return {
        pid: 1000 + (hp % 60000),
        pod: p.name,
        command: GPU_COMMANDS[hp % GPU_COMMANDS.length],
        type: (hp % 5 === 0 ? "C+G" : "C") as GpuProcess["type"],
        smUtil: r2(clamp(device.util * frac, 0.01, 0.99)),
        memMB: Math.round(device.memUsedMB * frac),
      };
    })
    .sort((a, b) => b.memMB - a.memMB);
}

// CUDA Activity — 최근 윈도 내 커널/복사 lane 타임라인 (cuda* 부착 노드에서만).
function gpuCudaActivity(node: ClusterNode, device: GpuDevice, attributable: boolean): CudaActivity | null {
  if (!attributable) return null;
  const windowMs = 200;
  const lanes = ["stream 7", "stream 13", "stream 21", "H2D copy", "D2H copy"];
  const events: CudaEvent[] = [];
  const density = 0.3 + device.util * 0.6; // util 높을수록 촘촘
  for (let lane = 0; lane < 3; lane++) {
    let t = strHash(node.name + device.name + "k" + lane) % 20;
    let idx = 0;
    while (t < windowMs) {
      const hh = strHash(node.name + device.name + "k" + lane + "_" + idx);
      const dur = 3 + (hh % 14);
      events.push({ lane, kind: "kernel", name: GPU_KERNELS[hh % GPU_KERNELS.length], startMs: t, durMs: dur });
      t += dur + Math.max(1, Math.round((hh % 10) * (1 - density)) + 1);
      idx++;
    }
  }
  for (const [lane, salt] of [[3, "h2d"], [4, "d2h"]] as const) {
    let t = strHash(node.name + device.name + salt) % 40;
    let idx = 0;
    while (t < windowMs) {
      const hh = strHash(node.name + device.name + salt + idx);
      const dur = 8 + (hh % 22);
      events.push({ lane, kind: lane === 3 ? "h2d" : "d2h", name: lane === 3 ? "memcpyHtoD" : "memcpyDtoH", startMs: t, durMs: dur });
      t += dur + 25 + (hh % 40);
      idx++;
    }
  }
  const h0 = strHash(node.name + device.name + "cuda");
  return {
    windowMs,
    lanes,
    events,
    launchRate: Math.round(800 + device.util * 5200 + (h0 % 300)),
    h2dMBs: Math.round(200 + device.util * 1800 + (h0 % 120)),
    d2hMBs: Math.round(120 + device.util * 1200 + (strHash(node.name + device.name + "d2h") % 90)),
  };
}

// Memory — 파드별 VRAM 시계열 (stacked). processes 와 동일 게이팅.
function gpuMemStack(node: ClusterNode, processes: GpuProcess[], device: GpuDevice, attributable: boolean): GpuMemStack | null {
  if (!attributable || !processes.length) return null;
  const steps = 24;
  const series = processes.map((p) => {
    const values: number[] = [];
    for (let i = 0; i < steps; i++) {
      const w = gpuWave(node.name + device.name + p.pod, i);
      values.push(Math.max(0, Math.round(p.memMB * (0.85 + w * 0.15))));
    }
    return { pod: p.pod, values };
  });
  return { steps, totalMB: device.memTotalMB, series };
}

// Interconnect — 단일 GPU 노드 토폴로지(고정 레이아웃) + PCIe 대역폭. 디바이스 레벨이라 항상.
// gpuBw 는 디바이스의 측정 PCIe throughput(device.pcieGbs), nicBw 는 노드 NIC throughput.
function gpuInterconnect(device: GpuDevice, nicGbs: number): GpuInterconnect {
  const nodes: GpuIcNode[] = [
    { id: "cpu", label: "CPU · NUMA0", kind: "cpu", x: 50, y: 26 },
    { id: "gpu0", label: device.name, kind: "gpu", x: 20, y: 80 },
    { id: "nic", label: "NIC mlx5_0", kind: "nic", x: 80, y: 80 },
  ];
  const gpuBw = device.pcieGbs;
  const nicBw = nicGbs;
  const links: GpuIcLink[] = [
    { from: "cpu", to: "gpu0", kind: "pcie", gbs: clamp(gpuBw, 0, 31.5), maxGbs: 31.5, label: "PCIe 4.0 x16" },
    { from: "cpu", to: "nic", kind: "pcie", gbs: clamp(nicBw, 0, 15.75), maxGbs: 15.75, label: "PCIe 4.0 x8" },
  ];
  return { nodes, links };
}

// Events — XID/ECC/throttle 이벤트 타임라인. DCGM/NVML 디바이스 레벨이라 항상.
function gpuEvents(node: ClusterNode, device: GpuDevice): GpuEvent[] {
  const events: GpuEvent[] = [];
  const h = strHash(node.name + device.name + "evt");
  if (device.hwThermalSlowdown) {
    events.push({ tSecAgo: 12 + (h % 30), kind: "throttle", severity: "crit", code: "HW Thermal Slowdown", text: `온도 ${device.tempC}°C ≥ slowdown ${device.tempSlowdownC}°C — 클럭 강제 하향` });
  }
  if (device.throttleReasons.includes("sw_power_cap")) {
    events.push({ tSecAgo: 30 + (h % 50), kind: "powerbrake", severity: "warn", code: "SW Power Cap", text: `전력 ${device.powerW}W ≈ limit ${device.powerLimitW}W — power brake 활성` });
  }
  if (device.throttleReasons.includes("gpu_idle")) {
    events.push({ tSecAgo: 5 + (h % 10), kind: "info", severity: "info", code: "GPU Idle", text: `SM active ${Math.round(device.util * 100)}% — 입력 부재로 idle` });
  }
  if (h % 3 === 0) {
    events.push({ tSecAgo: 180 + (h % 600), kind: "xid", severity: "warn", code: "XID 31", text: "GPU memory page fault — 애플리케이션의 잘못된 주소 접근" });
  }
  if (h % 5 === 0) {
    events.push({ tSecAgo: 420 + (h % 900), kind: "ecc", severity: "warn", code: "ECC SBE", text: "정정 가능 단일비트 ECC 오류 — 누적 카운터 증가" });
  }
  events.push({ tSecAgo: 1200 + (h % 1800), kind: "info", severity: "info", code: "Clocks Event", text: `application clock ${device.graphicsClockMHz}MHz 설정` });
  return events.sort((a, b) => a.tSecAgo - b.tSecAgo);
}

// 노드당 GPU 디바이스 수 — 시드 결정. 멀티 GPU(2/4/8)로 디바이스 드릴다운을 의미있게.
const GPU_COUNTS = [2, 4, 8];
function gpuCount(node: ClusterNode): number {
  return GPU_COUNTS[strHash(node.name + "gpucount") % GPU_COUNTS.length];
}

// 단일 디바이스 관측 묶음 — util 시드(dh)로 디바이스마다 텔레메트리·idle 여부를 분산.
// netAvg: 노드 네트워크 압력(0..1, netobs tcp_retransmit 기반) — 집합통신 정체 신호.
function buildDeviceView(
  node: ClusterNode,
  index: number,
  netAvg: number,
  attributable: boolean,
): GpuDeviceView {
  const dh = strHash(node.name + "gpu" + index);

  // ── idle 피딩 병목 후보 — 둘 다 측정 가능한 신호. 가장 강한 병목이 SM 을 굶긴다. ──
  const pcieStall = clamp(0.1 + ((dh >> 5) % 95) / 100, 0, 1); // PCIe H2D/D2H 점유 (디바이스 시드)
  const netStall = clamp(netAvg, 0, 1); // 집합통신 tcp 재전송 압력 (노드)
  const feed = Math.max(pcieStall, netStall);

  // 피딩 병목이 클수록 util 하락 (인과적). 디바이스 시드로 분산.
  const util = clamp(0.58 - feed * 0.62 + (dh % 18) / 100 - 0.05, 0.02, 0.95);
  const idle = util < 0.2;

  // 우세 원인 — idle 일 때만, 가장 큰 피딩 압력 (임계 미만이면 미스케줄로 분류)
  let dominantCause: GpuIdleCause = "none";
  if (idle) {
    const ranked: [GpuIdleCause, number][] = [
      ["pcie_saturated", pcieStall],
      ["network_stall", netStall],
    ];
    ranked.sort((a, b) => b[1] - a[1]);
    dominantCause = ranked[0][1] >= 0.5 ? ranked[0][0] : "none";
  }
  const health = dominantCause !== "none" ? r2(clamp(0.2 + util, 0, 0.95)) : r2(clamp(0.6 + util * 0.4, 0, 0.99));

  // PCIe throughput(측정값) — pcie 병목이면 포화, 그 외엔 util 기반 정상 트래픽.
  const pcieGbs = r2(clamp(Math.max(0.4 + util * 12, pcieStall * PCIE_X16_MAX_GBS), 0.4, PCIE_X16_MAX_GBS));
  // NIC throughput / tcp 재전송 — 노드 네트워크 압력에서 파생 (netobs 측정).
  const nicGbs = r2(clamp(1 + netStall * 14, 0, NIC_X8_MAX_GBS));
  const netRetransPerSec = Math.round(20 + netStall * 180);
  const netRttMs = Math.round(8 + netStall * 360);

  // 디바이스 텔레메트리 — util과 인과적으로 연결 (idle ↔ 저온·저전력·저클럭)
  const tempC = Math.round(clamp(34 + util * 50 + (dh % 8), 30, 96));
  const powerW = Math.round(clamp(28 + util * 290 + (dh % 16), 22, GPU_POWER_LIMIT_W));
  const graphicsClockMHz = idle ? 210 + (dh % 40) : Math.round(1500 + util * 420 + (dh % 60));
  const hwThermalSlowdown = tempC >= GPU_TEMP_SLOWDOWN_C;
  const throttleReasons: string[] = [];
  if (idle) throttleReasons.push("gpu_idle");
  if (hwThermalSlowdown) throttleReasons.push("hw_thermal_slowdown");
  if (powerW >= GPU_POWER_LIMIT_W - 8) throttleReasons.push("sw_power_cap");
  if (throttleReasons.length === 0) throttleReasons.push("none");

  const device: GpuDevice = {
    name: `gpu=${index}`,
    index,
    model: GPU_MODEL,
    util: r2(util),
    memUsedMB: Math.round(GPU_MEM_TOTAL_MB * (0.06 + util * 0.5)),
    memTotalMB: GPU_MEM_TOTAL_MB,
    tempC,
    tempSlowdownC: GPU_TEMP_SLOWDOWN_C,
    tempShutdownC: GPU_TEMP_SHUTDOWN_C,
    tempMaxC: GPU_TEMP_MAX_C,
    powerW,
    powerLimitW: GPU_POWER_LIMIT_W,
    graphicsClockMHz,
    hwThermalSlowdown,
    throttleReasons,
    pcieGbs,
    pcieMaxGbs: PCIE_X16_MAX_GBS,
  };

  // 교차 분석용 시계열 — 디바이스 인덱스로 파동 시드 분리 (현재값으로 수렴)
  const N = 24;
  const tempS: number[] = [];
  const powerS: number[] = [];
  const clockS: number[] = [];
  const thermS: number[] = [];
  for (let i = 0; i < N; i++) {
    const w = gpuWave(node.name + "d" + index, i);
    const conv = i / (N - 1); // 0→과거, 1→현재
    const wobble = w * (1 - conv * 0.7); // 현재로 갈수록 진폭 축소
    const t = Math.round(clamp(tempC + wobble * 9, 30, 97));
    const p = Math.round(clamp(powerW + wobble * 45, 22, GPU_POWER_LIMIT_W));
    const c = Math.round(clamp(graphicsClockMHz - wobble * (hwThermalSlowdown ? 220 : 70), 180, 2000));
    tempS.push(t);
    powerS.push(p);
    clockS.push(c);
    thermS.push(t >= GPU_TEMP_SLOWDOWN_C ? 1 : 0);
  }

  // 하위 탭 데이터 — perPodAvailable 은 cuda* uprobe 부착 여부로 결정 (노드별).
  const processes = gpuProcesses(node, device, attributable);
  const cudaActivity = gpuCudaActivity(node, device, attributable);
  const memSeries = gpuMemStack(node, processes, device, attributable);
  const interconnect = gpuInterconnect(device, nicGbs);
  const events = gpuEvents(node, device);
  const verdict = deviceVerdict(node, device, idle, dominantCause, health, attributable, {
    processes,
    netRetransPerSec,
    netRttMs,
    nicGbs,
  });

  return {
    device,
    series: { temp: tempS, power: powerS, clock: clockS, thermalSlowdown: thermS },
    idle,
    health,
    dominantCause,
    processes,
    cudaActivity,
    memSeries,
    interconnect,
    events,
    verdict,
  };
}

// GPU 노드가 아니면 null. 피딩 병목(PCIe 포화·집합통신 정체)이 입력을 막으면 GPU가 idle → health 하락.
export function nodeGpu(node: ClusterNode): GpuInfo | null {
  if (!node.gpu) return null;
  if (node.status === "down") {
    return {
      views: [],
      memPods: [],
      idle: false,
      health: 0,
      dominantCause: "none",
      agent: gpuAgentHealth(node, false),
      perPodAvailable: false,
    };
  }

  const live = node.pods.filter((p) => p.cpu >= 0);
  // 노드 네트워크 압력 — 파드 평균 net + 노드 집합통신(all-reduce) 버스트.
  // netobs 가 GPU 노드에도 떠 있어 tcp_retransmit 으로 측정 가능한 신호.
  // 집합통신 핫스팟은 일부 노드에만 발생(bimodal) — 그래야 pcie 병목과 깨끗이 갈린다.
  const baseNet = live.length ? live.map((p) => p.net).reduce((s, v) => s + v, 0) / live.length / 100 : 0;
  const collectiveHot = strHash(node.name + "collective") % 3 === 0;
  const netAvg = clamp(baseNet * 0.5 + (collectiveHot ? 0.45 + (strHash(node.name + "col2") % 35) / 100 : 0), 0, 1);
  // 런타임 API(cuda*) 부착 노드에서만 파드/PID별 CUDA 귀속 가능
  const attributable = cudaAttributable(node);
  const count = gpuCount(node);

  const views: GpuDeviceView[] = [];
  for (let index = 0; index < count; index++) {
    views.push(buildDeviceView(node, index, netAvg, attributable));
  }

  // 노드 롤업 — health 는 최악(min), idle 은 전부 idle, dominantCause 는 가장 심각한 idle 디바이스 기준.
  const health = views.reduce((m, v) => Math.min(m, v.health), 1);
  const idle = views.every((v) => v.idle);
  const worst = [...views].sort((a, b) => a.health - b.health)[0];
  const dominantCause: GpuIdleCause = worst?.dominantCause ?? "none";
  // memPods — 디바이스 전체에서 파드별 VRAM 합산
  const memMap = new Map<string, number>();
  for (const v of views) for (const p of v.processes) memMap.set(p.pod, (memMap.get(p.pod) ?? 0) + p.memMB);
  const memPods = [...memMap.entries()].map(([pod, memMB]) => ({ pod, memMB })).sort((a, b) => b.memMB - a.memMB);

  return {
    views,
    memPods,
    idle,
    health,
    dominantCause,
    agent: gpuAgentHealth(node, true),
    perPodAvailable: attributable,
  };
}

// ── 노드 레벨 GPU 토폴로지 — 노드 안 GPU들의 NVLink 메시 + PCIe host 경로 ──────────
// 디바이스 레벨 interconnect(CPU·GPU·NIC 단일)와 달리, 노드를 "GPU rack"으로 보고
// 멀티-GPU 배치를 한눈에. GPU 개수(2/4/8)에 맞춰 그리드로 깔고 인접 GPU는 NVLink,
// top-row GPU는 CPU로 PCIe host 경로를 연결. 디바이스 레벨이라 항상 관측 가능.
const NVLINK_MAX_GBS = 50; // per-link 집계 대역폭 상한 (시각화 정규화 기준)
export function nodeGpuTopology(node: ClusterNode, info: GpuInfo): GpuInterconnect | null {
  if (info.views.length === 0) return null;
  const views = info.views;
  const n = views.length;
  const cols = n <= 2 ? n : n === 4 ? 2 : 4;
  const rows = Math.ceil(n / cols);
  const rowY = rows === 1 ? [70] : [56, 86];
  const colX = (count: number) =>
    count === 1 ? [50] : Array.from({ length: count }, (_, i) => 18 + (64 * i) / (count - 1));

  const nodes: GpuIcNode[] = [{ id: "cpu", label: "CPU · NUMA0", kind: "cpu", x: 50, y: 14 }];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const rowCount = Math.min(cols, n - r * cols);
    nodes.push({ id: `gpu${i}`, label: `GPU ${i}`, kind: "gpu", x: colX(rowCount)[c], y: rowY[r] });
  }

  const links: GpuIcLink[] = [];
  // PCIe host 경로 — top-row GPU만 (PCIe root). util 높을수록 host 전송 점유 증가.
  for (let i = 0; i < n; i++) {
    if (Math.floor(i / cols) !== 0) continue;
    const d = views[i].device;
    links.push({
      from: "cpu", to: `gpu${i}`, kind: "pcie",
      gbs: d.pcieGbs, maxGbs: d.pcieMaxGbs, label: "PCIe 4.0 x16",
    });
  }
  // NVLink — 행 내 수평 인접쌍 + 행 간 수직 인접쌍. 양쪽 GPU가 함께 바쁠수록 트래픽↑.
  const nvBw = (a: number, b: number) => {
    const u = Math.min(views[a].device.util, views[b].device.util);
    return r2(clamp(2 + u * 44 + (strHash(node.name + "nvl" + a + "_" + b) % 60) / 10, 0, NVLINK_MAX_GBS));
  };
  for (let r = 0; r < rows; r++) {
    const rowCount = Math.min(cols, n - r * cols);
    for (let c = 0; c < rowCount - 1; c++) {
      const a = r * cols + c, b = r * cols + c + 1;
      links.push({ from: `gpu${a}`, to: `gpu${b}`, kind: "nvlink", gbs: nvBw(a, b), maxGbs: NVLINK_MAX_GBS, label: "NVLink" });
    }
  }
  if (rows === 2) {
    for (let c = 0; c < cols; c++) {
      const a = c, b = cols + c;
      if (b < n) links.push({ from: `gpu${a}`, to: `gpu${b}`, kind: "nvlink", gbs: nvBw(a, b), maxGbs: NVLINK_MAX_GBS, label: "NVLink" });
    }
  }
  return { nodes, links };
}

// ── GPU 진단 (verdict) — "GPU가 왜 안 되는가"를 실패 모드로 분류 ─────────────────
// 원인 규명에 최적화: 신호를 인과적으로 묶어 결론·인과사슬·범인·조치를 도출.

export type GpuFailureMode =
  | "ok" // 정상 활용
  | "idle_pcie_saturated" // idle — H2D/D2H 복사가 PCIe 대역폭 포화
  | "idle_network_stall" // idle — 집합통신(all-reduce) 이 tcp 재전송으로 블로킹
  | "idle_unscheduled" // idle — 도달하는 GPU 워크로드 없음
  | "throttled" // 열/전력 하드웨어 제약
  | "unobservable"; // agent down — 텔레메트리 수집 불가

export type GpuVerdict = {
  mode: GpuFailureMode;
  modeLabel: string;
  severity: Severity | "ok";
  headline: string;
  detail: string;
  evidence: string[]; // 인과적으로 묶은 핵심 신호 (왜 이 결론인가)
  chain: string | null; // 인과 사슬
  culprits: { pod: string; score: number }[]; // 원인 후보 파드 (드릴다운)
  culpritLabel: string | null; // 원인 후보의 분류 축 (예: "network retransmit")
  attributionBlind: boolean; // 파드별 CUDA 귀속 불가 — 원인 규명 시 제약
  action: string;
};

const GPU_MODE_LABEL: Record<GpuFailureMode, string> = {
  ok: "정상 활용",
  idle_pcie_saturated: "Idle · PCIe 포화",
  idle_network_stall: "Idle · 통신 정체",
  idle_unscheduled: "Idle · 미스케줄",
  throttled: "Throttled",
  unobservable: "관측 불가",
};

// 디바이스 단위 진단 — "이 GPU가 왜 안 되는가"를 실패 모드로 분류.
function deviceVerdict(
  node: ClusterNode,
  d: GpuDevice,
  idle: boolean,
  dominantCause: GpuIdleCause,
  health: number,
  perPodAvailable: boolean,
  signals: { processes: GpuProcess[]; netRetransPerSec: number; netRttMs: number; nicGbs: number },
): GpuVerdict {
  const base = (m: GpuFailureMode) => ({ mode: m, modeLabel: GPU_MODE_LABEL[m] });
  const sm = Math.round(d.util * 100);
  const live = node.pods.filter((p) => p.cpu >= 0);
  // 네트워크 후보 — pod 별 net (netobs pod_bytes, cuda* 없이도 측정). 집합통신 정체의 범인 후보.
  const netCulprits = live
    .map((p) => ({ pod: p.name, score: r2(p.net / 100) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  // PCIe 후보 — H2D 복사가 무거운 파드. 파드별 복사 귀속은 cuda* 필요 → 미부착이면 blind.
  const pcieCulprits = [...signals.processes]
    .sort((a, b) => b.memMB - a.memMB)
    .slice(0, 3)
    .map((p) => ({ pod: p.pod, score: r2(p.smUtil) }));
  const attributionBlind = !perPodAvailable;
  const pciePct = Math.round((d.pcieGbs / d.pcieMaxGbs) * 100);

  // 2) Throttle — 활용 중인데 열/전력 하드웨어 제약
  const hwThrottle =
    d.hwThermalSlowdown || d.throttleReasons.some((r) => r === "hw_thermal_slowdown" || r === "sw_power_cap");
  if (!idle && hwThrottle) {
    return {
      ...base("throttled"),
      severity: d.hwThermalSlowdown ? "crit" : "warn",
      headline: `${d.name} — 하드웨어 제약(열/전력)으로 throttle됩니다`,
      detail: `SM active ${sm}%인데 온도 ${d.tempC}°C·전력 ${d.powerW}W로 클럭이 ${d.graphicsClockMHz}MHz까지 강제 하향됩니다.`,
      evidence: [
        `온도 ${d.tempC}°C (slowdown ${d.tempSlowdownC}°C) · hw_thermal_slowdown=${d.hwThermalSlowdown ? 1 : 0}`,
        `전력 ${d.powerW}W / limit ${d.powerLimitW}W`,
        `throttle reasons: ${d.throttleReasons.join(", ")}`,
      ],
      chain: null,
      culprits: [],
      culpritLabel: null,
      attributionBlind,
      action: "냉각/전력 한도 점검 · 워크로드 분산으로 열·전력 부하 완화",
    };
  }

  // 3) Idle — 하드웨어는 정상인데 일이 안 들어옴. 우세 피딩 병목으로 원인을 분기.
  if (idle) {
    const sevByHealth: Severity = health < 0.45 ? "crit" : "warn";
    const hwOk = `SM active ${sm}% (idle) + 온도 ${d.tempC}°C + 전력 ${d.powerW}W + 클럭 ${d.graphicsClockMHz}MHz → 하드웨어 정상, 입력 부재`;

    // 3a) PCIe 포화 — H2D/D2H 복사가 대역폭을 채워 SM 피딩이 밀린다 (DCGM PROF_PCIE 측정).
    if (dominantCause === "pcie_saturated") {
      const top = pcieCulprits[0]?.pod;
      return {
        ...base("idle_pcie_saturated"),
        severity: sevByHealth,
        headline: `${d.name} idle — PCIe 대역폭 포화로 피딩되지 않습니다`,
        detail: `SM active ${sm}%인데 PCIe 4.0 x16가 ${d.pcieGbs}GB/s(${pciePct}%)로 포화 — H2D 입력 복사가 연산 피딩을 따라가지 못합니다.`,
        evidence: [
          hwOk,
          `PCIe 4.0 x16 H2D+D2H ${d.pcieGbs}GB/s / ${d.pcieMaxGbs} (${pciePct}%) — DCGM PROF_PCIE_TX/RX`,
          attributionBlind
            ? "PCIe 점유는 디바이스 레벨로 측정되나, 파드별 복사 귀속은 cuda* 미부착으로 불가"
            : top
              ? `복사 우세 파드 ${top} — H2D memcpy 점유 상위`
              : "",
        ].filter(Boolean),
        chain: `H2D 복사 PCIe ${pciePct}% 포화 → SM 피딩 stall → GPU idle`,
        culprits: attributionBlind ? [] : pcieCulprits,
        culpritLabel: attributionBlind ? null : "pcie H2D copy",
        attributionBlind,
        action: "데이터로더 최적화(pinned memory·prefetch·배치 확대)로 H2D 복사 절감 · PCIe 경로 경합/토폴로지 점검",
      };
    }

    // 3b) 네트워크 정체 — 집합통신(all-reduce)이 tcp 재전송으로 블로킹 (netobs 측정).
    if (dominantCause === "network_stall") {
      return {
        ...base("idle_network_stall"),
        severity: sevByHealth,
        headline: `${d.name} idle — 집합통신 정체로 연산이 대기합니다`,
        detail: `SM active ${sm}%인데 tcp_retransmit ${signals.netRetransPerSec}/s·p99 RTT ${signals.netRttMs}ms — 분산학습 all-reduce가 막혀 GPU가 gradient 교환을 기다립니다.`,
        evidence: [
          hwOk,
          `netobs tcp_retransmit_skb ${signals.netRetransPerSec}/s · p99 RTT ${signals.netRttMs}ms (NIC mlx5_0)`,
          `NIC PCIe x8 ${signals.nicGbs}GB/s — gradient all-reduce 트래픽`,
        ],
        chain: `tcp 재전송 폭증 → all-reduce 블로킹 → GPU 연산 대기(idle)`,
        culprits: netCulprits,
        culpritLabel: "network retransmit",
        attributionBlind,
        action: "NIC/CNI 재전송 원인 점검 · NCCL 통신 백엔드/타임아웃 확인 · 네트워크 정책·대역폭 점검",
      };
    }

    // 3c) 미스케줄 — 우세 병목 없음, 도달하는 GPU 워크로드 자체가 없음.
    return {
      ...base("idle_unscheduled"),
      severity: sevByHealth,
      headline: `${d.name} idle — 도달하는 GPU 워크로드가 없습니다`,
      detail: `SM active ${sm}%, 온도·전력·클럭 모두 낮음 — 하드웨어는 정상이나 GPU로 들어오는 작업이 없습니다.`,
      evidence: [hwOk, "스케줄된 GPU 파드 없음 / 입력 trigger 부재 (디바이스 바인딩 의심)"],
      chain: null,
      culprits: [],
      culpritLabel: null,
      attributionBlind,
      action: "GPU 워크로드 스케줄/입력 경로 점검 · 잘못된 디바이스 바인딩 확인",
    };
  }

  // 4) 정상 활용
  return {
    ...base("ok"),
    severity: "ok",
    headline: `${d.name} — 정상적으로 활용되고 있습니다`,
    detail: `SM active ${sm}%, 온도 ${d.tempC}°C·전력 ${d.powerW}W — 활용·온도·전력 모두 정상 범위입니다.`,
    evidence: [
      `SM active ${sm}% · 온도 ${d.tempC}°C · 전력 ${d.powerW}W · 클럭 ${d.graphicsClockMHz}MHz`,
      "active throttle 없음",
    ],
    chain: null,
    culprits: [],
    culpritLabel: null,
    attributionBlind,
    action: attributionBlind
      ? "정상 — 단, 파드별 귀속은 런타임 심볼 미부착으로 불가 (원인 규명 시 제약 존재)"
      : "정기 모니터링 유지",
  };
}

// 노드 GPU 롤업 진단 — agent down 이면 관측 불가, 아니면 최악(severity) 디바이스의 결론.
// 호출부(노드 진단 카드·warning evidence)는 노드 단위 결론을 기대하므로 worst 디바이스로 대표.
export function gpuVerdict(node: ClusterNode): GpuVerdict | null {
  const gpu = nodeGpu(node);
  if (!gpu) return null;

  // 관측 불가 — agent down → 어떤 신호도 신뢰 불가 (최우선 분기)
  if (!gpu.agent.up || gpu.views.length === 0) {
    return {
      mode: "unobservable",
      modeLabel: GPU_MODE_LABEL.unobservable,
      severity: "crit",
      headline: "GPU 텔레메트리를 관측할 수 없습니다",
      detail: "gpuobs-agent가 DOWN — DCGM/NVML 수집이 중단되어 GPU 상태 자체를 판단할 수 없습니다.",
      evidence: ["gpuobs-agent scrape target DOWN", "DCGM exporter / NVML 응답 없음 → 모든 디바이스 지표 결측"],
      chain: null,
      culprits: [],
      culpritLabel: null,
      attributionBlind: true,
      action: "노드/agent 상태 복구가 선행되어야 원인 규명 가능 — 텔레메트리 파이프라인부터 점검",
    };
  }

  const rank: Record<Severity | "ok", number> = { ok: 0, warn: 1, crit: 2 };
  return [...gpu.views].sort((a, b) => rank[b.verdict.severity] - rank[a.verdict.severity])[0].verdict;
}

// ── 파드 관점 GPU 사용 — "이 파드가 어떤 GPU를 어떻게 쓰는가" ────────────────────
// GPU Detail("누가 나를 쓰는가")의 반대 관점. 같은 귀속 데이터(view.processes)를 파드 기준으로 집계.
export type PodGpuEntry = {
  deviceName: string; // "gpu=0"
  deviceIndex: number;
  smUtil: number; // 0..1 (이 파드 귀속분)
  memMB: number;
  memTotalMB: number;
  command: string;
  type: GpuProcess["type"];
  launchRate: number; // 이 파드 추정 kernel launches/s
};
export type PodGpuUsage = {
  perPodAvailable: boolean; // false → cuda* 미부착으로 파드별 귀속 불가
  entries: PodGpuEntry[]; // 이 파드가 점유한 (디바이스별) 항목 — 비어있으면 GPU 미사용
};

export function podGpuUsage(node: ClusterNode, pod: Pod): PodGpuUsage | null {
  const gpu = nodeGpu(node);
  if (!gpu) return null; // GPU 노드 아님 → 파드에 GPU 탭 없음
  if (!gpu.perPodAvailable) return { perPodAvailable: false, entries: [] };
  const entries: PodGpuEntry[] = [];
  for (const v of gpu.views) {
    for (const p of v.processes) {
      if (p.pod !== pod.name) continue;
      // 파드 추정 launch rate = 디바이스 launchRate × (파드 smUtil / 디바이스 util)
      const share = v.device.util > 0 ? clamp(p.smUtil / v.device.util, 0, 1) : 0;
      const launchRate = Math.round((v.cudaActivity?.launchRate ?? 0) * share);
      entries.push({
        deviceName: v.device.name,
        deviceIndex: v.device.index,
        smUtil: p.smUtil,
        memMB: p.memMB,
        memTotalMB: v.device.memTotalMB,
        command: p.command,
        type: p.type,
        launchRate,
      });
    }
  }
  entries.sort((a, b) => b.memMB - a.memMB);
  return { perPodAvailable: true, entries };
}

export type NodeHealth = { cpu: number; net: number; mem: number; gpu: number | null };

export function nodeHealth(node: ClusterNode): NodeHealth {
  if (node.status === "down") return { cpu: 0, net: 0, mem: 0, gpu: node.gpu ? 0 : null };
  const live = node.pods.filter((p) => p.cpu >= 0);
  const an = live.map((p) => podAnalytics(node, p));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
  const cpu = 1 - avg(an.map((a) => a.throttle));
  const mem = 1 - avg(an.map((a) => a.memPressure));
  const dropAvg = avg(an.map((a) => a.drops.reduce((s, d) => s + d.rate, 0)));
  const net = clamp(1 - dropAvg / 220, 0, 1);
  const gpuInfo = nodeGpu(node);
  return { cpu: r2(cpu), net: r2(net), mem: r2(mem), gpu: gpuInfo ? gpuInfo.health : null };
}

// victim_signal — 간섭을 받은 자원 신호. 간섭 탭의 분류 축이다.
export const NOISY_SIGNALS = ["latency", "memory", "network", "cpu"] as const;
export type NoisySignal = (typeof NOISY_SIGNALS)[number];

export const NOISY_SIGNAL_LABEL: Record<NoisySignal, string> = {
  latency: "지연",
  memory: "메모리",
  network: "네트워크",
  cpu: "CPU",
};

export type NoisyNeighbor = {
  rank: number; // signal 그룹 내 causal_strength 순위
  signal: NoisySignal; // victim_signal
  suspectNs: string; // suspect_namespace
  suspect: string; // suspect_pod
  victimNs: string; // victim_namespace
  victim: string; // victim_pod
  score: number;
  lagSeconds: number; // suspect→victim 시간차 (음수 = victim 신호가 먼저)
  impactSeconds: number; // 영향 지속 시간
  causalStrength: number; // 인과 강도 — 주 정렬 기준 (작을수록 약함)
};

const noisyNs = (name: string) => name.replace(/-\d+$/, "");

export function nodeNoisyNeighbors(node: ClusterNode): NoisyNeighbor[] {
  const live = node.pods.filter((p) => p.cpu >= 0);
  if (live.length < 2) return [];

  // signal별로 관련 자원 지표가 높은 파드(suspect)를 낮은 파드(victim)와 짝지어 후보를 만든다.
  const specs: { signal: NoisySignal; metric: (p: Pod) => number; weight: number; take: number }[] = [
    { signal: "latency", metric: (p) => p.net * 0.7 + p.cpu * 0.3, weight: 0.26, take: 3 },
    { signal: "network", metric: (p) => p.net, weight: 0.28, take: 3 },
    { signal: "memory", metric: (p) => p.mem, weight: 0.24, take: 2 },
    { signal: "cpu", metric: (p) => p.cpu, weight: 0.22, take: 2 },
  ];

  const out: NoisyNeighbor[] = [];
  for (const { signal, metric, weight, take } of specs) {
    const sorted = [...live].sort((a, b) => metric(b) - metric(a));
    const n = Math.min(take, sorted.length - 1);
    for (let i = 0; i < n; i++) {
      const suspect = sorted[i];
      const victim = sorted[sorted.length - 1 - i];
      if (suspect.name === victim.name) continue;
      const h = strHash(suspect.name + signal + victim.name);
      out.push({
        rank: 0,
        signal,
        suspectNs: noisyNs(suspect.name),
        suspect: suspect.name,
        victimNs: noisyNs(victim.name),
        victim: victim.name,
        score: r3(0.4 + (metric(suspect) / 100) * weight + (h % 8) / 100),
        lagSeconds: ((h % 3) - 1) * 30, // -30 / 0 / 30
        impactSeconds: r2((h % 60) / 10),
        causalStrength: (0.5 + (h % 250) / 100) * 1e-16,
      });
    }
  }

  // signal 그룹별 causal_strength 내림차순으로 rank 부여
  const ranked: NoisyNeighbor[] = [];
  for (const s of NOISY_SIGNALS) {
    const group = out.filter((r) => r.signal === s).sort((a, b) => b.causalStrength - a.causalStrength);
    group.forEach((r, i) => (r.rank = i + 1));
    ranked.push(...group);
  }
  return ranked;
}

export const ALERT_NAME: Record<AnomalyKind, string> = {
  cpu: "CPUThrottlingHigh",
  mem: "MemoryPressureHigh",
  net: "NetworkRetransmitHigh",
  latency: "RequestLatencyHigh",
  errors: "ErrorRateHigh",
  node: "NodeNotReady",
};
const ALERT_COMP: Record<AnomalyKind, string> = {
  cpu: "kubelet",
  mem: "kubelet",
  net: "cilium",
  latency: "app",
  errors: "app",
  node: "kubelet",
};

export type NodeAlert = {
  name: string;
  severity: Severity;
  component: string;
  pod: string | null;
  kind: AnomalyKind;
};

export function nodeAlerts(node: ClusterNode): NodeAlert[] {
  if (node.status === "down") {
    return [{ name: ALERT_NAME.node, severity: "crit", component: ALERT_COMP.node, pod: null, kind: "node" }];
  }
  const out: NodeAlert[] = [];
  for (const p of node.pods) {
    const a = ANOMALIES[p.name];
    if (a) out.push({ name: ALERT_NAME[a.kind], severity: a.sev, component: ALERT_COMP[a.kind], pod: p.name, kind: a.kind });
  }
  return out.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === "crit" ? -1 : 1));
}

// 단일 파드에 발생 중인 알림
export function podAlertList(node: ClusterNode, pod: Pod): NodeAlert[] {
  if (pod.cpu < 0) {
    return node.status === "down"
      ? [{ name: ALERT_NAME.node, severity: "crit", component: ALERT_COMP.node, pod: pod.name, kind: "node" }]
      : [];
  }
  const a = ANOMALIES[pod.name];
  return a ? [{ name: ALERT_NAME[a.kind], severity: a.sev, component: ALERT_COMP[a.kind], pod: pod.name, kind: a.kind }] : [];
}

// ── 노드 진단 (Root Cause verdict) — 신호를 종합해 "답"을 도출 ──────────────────

export type DiagDimension = "cpu" | "mem" | "net" | "gpu" | "node" | "latency" | "errors";

export type Diagnosis = {
  severity: Severity | "ok";
  dimension: DiagDimension;
  dimHealth: number;
  headline: string;
  detail: string;
  ebpf: string[]; // 원인 신호 (진단 카드에 통합)
  signalSource: "ebpf" | "control-plane"; // 신호 출처
  culprits: { pod: string; score: number }[]; // 원인 후보 파드
  chain: string | null; // 인과 사슬 (noisy neighbor)
  action: string;
  confidence: number; // 0..1
};

const DIM_LABEL: Record<DiagDimension, string> = {
  cpu: "CPU", mem: "메모리", net: "네트워크", gpu: "GPU", node: "노드", latency: "지연", errors: "에러",
};
const DIM_METRIC: Record<DiagDimension, string> = {
  cpu: "cpu_throttle_score",
  mem: "memory_pressure_score",
  net: "drop+retrans /s",
  gpu: "gpu_util / sm_active",
  node: "node status",
  latency: "stage p99 (µs)",
  errors: "error rate (5xx)",
};
const DIM_ACTION: Record<DiagDimension, string> = {
  cpu: "CPU limit 상향 또는 핫패스 최적화 · throttle 상위 파드부터 점검",
  mem: "메모리 누수 프로파일 · limit 상향/replica 증설 · OOM 위험 파드 점검",
  net: "재전송/드롭 상위 파드의 대상 서비스·CNI·conntrack 한도 점검",
  gpu: "GPU 입력 파이프라인 점검 · PCIe 복사·집합통신 병목 해소로 피딩 회복 · MIG/스케줄 조정",
  node: "노드 상태/네트워크/런타임 점검 · 파드 재스케줄 확인",
  latency: "병목 단계(off-CPU·락 경합·커넥션 풀 대기) 점검 · 지연 상위 경로 최적화",
  errors: "최근 배포 롤백 검토 · 업스트림 의존성 상태 및 에러 급증 경로 추적",
};

// Anomaly 종류 → 진단 차원 매핑 (파드 진단에서 사용)
const ANOMALY_DIM: Record<AnomalyKind, DiagDimension> = {
  cpu: "cpu", mem: "mem", net: "net", latency: "latency", errors: "errors", node: "node",
};

// 노드 warning 의 "실제 트리거"를 worst 차원별로 구체 신호로 환산.
// 추상 점수(health 0.36) 대신 kubelet 컨디션·PSI·드롭/재전송 같은 실측치와 범인 파드를 낸다.
type WarnEvidence = {
  headline: string;
  detail: string;
  ebpf: string[];
  action: string;
  culprits: { pod: string; score: number }[];
  source: "control-plane" | "ebpf";
};

function nodeWarningEvidence(node: ClusterNode, worst: { key: DiagDimension; v: number }, podNote: string): WarnEvidence {
  // GPU 차원 — gpuVerdict 의 결론/근거를 그대로 끌어온다.
  if (worst.key === "gpu") {
    const gv = gpuVerdict(node);
    if (gv) {
      return {
        headline: `${node.name} GPU — ${gv.modeLabel}`,
        detail: `${gv.detail}${podNote}`,
        ebpf: gv.evidence,
        action: gv.action,
        culprits: gv.culprits,
        source: "ebpf",
      };
    }
  }

  // 네트워크 — CNI 경로 드롭/재전송 실측 (kubelet 컨디션 아님, eBPF 관측)
  if (worst.key === "net") {
    const lat = nodeStageLatency(node);
    const retrans = nodeRetransByWorkload(node);
    const drops = nodeDropReasons(node);
    const topR = retrans[0];
    const topD = drops[0];
    return {
      headline: `${node.name} 네트워크 품질 저하 (CNI)`,
      detail:
        `노드 네트워크 경로에서 드롭·재전송이 상승했습니다 — CNI/conntrack·대상 서비스 경로를 점검하세요.` +
        `${topR ? ` 재전송 상위 워크로드는 ${topR.workload}입니다.` : ""}${podNote}`,
      ebpf: [
        `TX 병목 단계 ${lat.txBottleneck} · RX 병목 ${lat.rxBottleneck} (p99 최대)`,
        ...(topR ? [`TCP 재전송 상위: ${topR.workload} ${topR.rate}/s`] : []),
        ...(topD ? [`drop reason 상위: ${topD.reason} (${topD.category}) ${topD.rate}/s @ ${topD.workload}`] : []),
      ],
      action: DIM_ACTION.net,
      culprits: retrans.slice(0, 3).map((r) => ({ pod: r.workload, score: r2(r.rate) })),
      source: "ebpf",
    };
  }

  // CPU — cgroup throttle 실측 + throttle 상위 파드
  const live = node.pods.filter((p) => p.cpu >= 0);
  const throttled = live
    .map((p) => ({ pod: p.name, score: r2(podAnalytics(node, p).throttle) }))
    .sort((a, b) => b.score - a.score);
  const top = throttled[0];
  const throttlePct = Math.round((1 - worst.v) * 100);
  return {
    headline: `${node.name} CPU throttle 압박`,
    detail:
      `노드 파드들의 CPU throttle 이 상승했습니다 — limit/quota 여유와 핫패스를 점검하세요.` +
      `${top ? ` throttle 상위 파드는 ${top.pod}입니다.` : ""}${podNote}`,
    ebpf: [
      `cgroup cpu.stat throttled 평균 ${throttlePct}%`,
      "runqueue latency 상승 — on-CPU 핫패스 경합 추정",
      ...(top ? [`throttle 상위: ${top.pod} (${Math.round(top.score * 100)}%)`] : []),
    ],
    action: DIM_ACTION.cpu,
    culprits: throttled.slice(0, 3),
    source: "ebpf",
  };
}

export function nodeDiagnosis(node: ClusterNode): Diagnosis {
  if (node.status === "down") {
    return {
      severity: "crit",
      dimension: "node",
      dimHealth: 0,
      headline: `${node.name} 가 NotReady 상태입니다`,
      detail: "노드가 응답하지 않아 eBPF 텔레메트리가 수집되지 않습니다. control-plane 신호로만 감지됩니다.",
      ebpf: nodeDownAnomaly(node).ebpf,
      signalSource: "control-plane",
      culprits: [],
      chain: null,
      action: DIM_ACTION.node,
      confidence: 0.95,
    };
  }

  // ── 노드 단위 진단 — severity 는 "노드 자체 상태"로만 정한다. ──
  // 개별 파드의 이상(ANOMALIES)은 노드로 전파하지 않는다. 파드 단위 문제는
  // 파드맵(honeycomb)·알림 탭·파드 상세에서 따로 본다.
  const health = nodeHealth(node);
  const gpuInfo = nodeGpu(node);
  const dimList: { key: DiagDimension; v: number }[] = [
    { key: "cpu", v: health.cpu },
    { key: "net", v: health.net },
  ];
  if (gpuInfo) dimList.push({ key: "gpu", v: gpuInfo.health });
  const worstDim = dimList.sort((a, b) => a.v - b.v)[0];

  // 파드 알림 개수 — severity 에는 영향을 주지 않는 "어디를 볼지" 포인터로만 사용
  const podCrit = node.pods.filter((p) => ANOMALIES[p.name]?.sev === "crit").length;
  const podWarn = node.pods.filter((p) => ANOMALIES[p.name]?.sev === "warn").length;
  const podNote =
    podCrit + podWarn > 0
      ? ` 이 노드의 파드 알림 ${podCrit + podWarn}건(심각 ${podCrit}·경고 ${podWarn})은 파드 단위 문제이며, 알림 탭·파드맵에서 확인하세요.`
      : "";

  // 노드 경고 — worst 차원의 "실제 트리거"를 구체 신호로 환산해 결론을 낸다.
  if (node.status === "warning") {
    const ev = nodeWarningEvidence(node, worstDim, podNote);
    return {
      severity: "warn",
      dimension: worstDim.key,
      dimHealth: r2(worstDim.v),
      headline: ev.headline,
      detail: ev.detail,
      ebpf: ev.ebpf,
      signalSource: ev.source,
      culprits: ev.culprits,
      chain: null,
      action: ev.action,
      confidence: 0.75,
    };
  }

  // 노드 컨디션 Ready → 노드 자체는 정상. 파드 알림이 있어도 노드 severity 는 정상.
  return {
    severity: "ok",
    dimension: worstDim.key,
    dimHealth: worstDim.v,
    headline: `${node.name} 노드는 정상입니다`,
    detail: `노드 컨디션 Ready — 노드 단위 이상이 없습니다.${podNote}`,
    ebpf: [],
    signalSource: "ebpf",
    culprits: [],
    chain: null,
    action: podCrit + podWarn > 0 ? "노드는 정상 — 파드 알림은 알림 탭·파드맵에서 점검" : "정기 모니터링 유지",
    confidence: 0.85,
  };
}

// ── 파드 진단 (Root Cause verdict) — 단일 파드 신호 종합 ────────────────────────

function podDerivedSignals(dim: DiagDimension, a: PodAnalytics): string[] {
  if (dim === "cpu") {
    return [`cgroup cpu.stat throttled ${Math.round(a.throttle * 100)}%`, "runqueue latency 상승 — on-CPU 핫패스 경합 추정"];
  }
  if (dim === "mem") {
    return [`memory_pressure_score ${a.memPressure.toFixed(2)}`, "page fault / reclaim 증가 — RSS 압박 추정"];
  }
  const dq = a.drops.find((d) => d.category === "drop queue")?.rate ?? 0;
  const rt = a.drops.find((d) => d.category === "retrans")?.rate ?? 0;
  return [`tx 경로 병목 단계: ${a.bottleneck} (p99 최대)`, `drop queue ${dq}/s · retrans ${rt}/s`];
}

// 파드 단위 진단. no-data + 노드 정상이면 null (호출부에서 "데이터 없음" 처리).
export function podDiagnosis(node: ClusterNode, pod: Pod): Diagnosis | null {
  if (pod.cpu < 0) {
    if (node.status !== "down") return null;
    const dn = nodeDownAnomaly(node);
    return {
      severity: "crit",
      dimension: "node",
      dimHealth: 0,
      headline: `호스트 노드(${node.name})가 NotReady 상태입니다`,
      detail: "호스트가 응답하지 않아 이 파드의 eBPF 텔레메트리가 수집되지 않습니다. control-plane 신호로만 감지됩니다.",
      ebpf: dn.ebpf,
      signalSource: "control-plane",
      culprits: [],
      chain: null,
      action: DIM_ACTION.node,
      confidence: 0.9,
    };
  }

  const a = podAnalytics(node, pod);
  const anomaly = podAnomaly(node, pod);
  const health = podHealth(node, pod);

  // noisy neighbor 관여 — victim 측 suspect 를 원인 후보로, 인과 사슬 구성
  const noisy = nodeNoisyNeighbors(node);
  const asVictim = noisy.filter((r) => r.victim === pod.name).sort((x, y) => y.score - x.score);
  const asSuspect = noisy.filter((r) => r.suspect === pod.name).sort((x, y) => y.score - x.score);
  const culprits = asVictim.slice(0, 3).map((r) => ({ pod: r.suspect, score: r.score }));
  const chain = asVictim[0]
    ? `${asVictim[0].suspect} → ${pod.name} ${asVictim[0].signal} 간섭 (score ${asVictim[0].score.toFixed(3)})`
    : asSuspect[0]
      ? `${pod.name} → ${asSuspect[0].victim} ${asSuspect[0].signal} 간섭 (score ${asSuspect[0].score.toFixed(3)})`
      : null;

  const healthOf = (d: DiagDimension) => (d === "cpu" ? health.cpu : d === "mem" ? health.mem : health.net);

  // 1) 명시적 anomaly = 라벨링된 근본 원인 → 그대로 결론
  if (anomaly) {
    const dim = ANOMALY_DIM[anomaly.kind];
    const conf = clamp(0.6 + (asVictim[0]?.score ?? 0) * 0.15 + (anomaly.sev === "crit" ? 0.2 : 0.05), 0.4, 0.97);
    return {
      severity: anomaly.sev,
      dimension: dim,
      dimHealth: r2(healthOf(dim)),
      headline: anomaly.headline,
      detail: `${pod.name} 에서 ${KIND_LABEL[anomaly.kind]} 계열 이상이 직접 관측됩니다 — eBPF 신호로 원인을 특정했습니다.`,
      ebpf: anomaly.ebpf,
      signalSource: anomaly.source ?? "ebpf",
      culprits,
      chain,
      action: anomaly.action,
      confidence: r2(conf),
    };
  }

  // 2) 명시적 anomaly 없음 → 실장애 아님(정상). 약한 차원은 추세 관찰용 안내로만 노출.
  //    eBPF health 점수가 낮아도 OOM/크래시 등 실장애가 아니면 심각/경고를 만들지 않는다.
  const dims = ([
    { key: "cpu", v: health.cpu },
    { key: "mem", v: health.mem },
    { key: "net", v: health.net },
  ] as { key: DiagDimension; v: number }[]).sort((x, y) => x.v - y.v);
  const worst = dims[0];
  const low = worst.v < 0.6;
  return {
    severity: "ok",
    dimension: worst.key,
    dimHealth: worst.v,
    headline: asSuspect[0]
      ? "실장애는 없으나 인접 파드에 간섭을 유발합니다"
      : "이 파드에서 실장애·이상 사건이 관측되지 않습니다",
    detail: low
      ? `OOM/크래시 등 실장애나 카탈로그된 이상이 없습니다. 다만 ${DIM_LABEL[worst.key]} health ${worst.v.toFixed(2)}로 가장 낮아 추세 관찰을 권장합니다.`
      : "OOM/크래시 등 실장애가 없고, CPU·메모리·네트워크 health 도 정상 범위입니다.",
    ebpf: low ? podDerivedSignals(worst.key, a) : [],
    signalSource: "ebpf",
    culprits: [],
    chain,
    action: low ? `추세 관찰 — ${DIM_ACTION[worst.key]}` : "정기 모니터링 유지",
    confidence: 0.8,
  };
}

export { DIM_LABEL, DIM_METRIC };

// 클러스터 전체 health (cluster overview)
export function clusterHealth(): NodeHealth & { dominant: string } {
  const live = NODES.filter((n) => n.status !== "down");
  const hs = live.map(nodeHealth);
  const avg = (sel: (h: NodeHealth) => number) => (hs.length ? hs.reduce((s, h) => s + sel(h), 0) / hs.length : 0);
  const cpu = r2(avg((h) => h.cpu));
  const net = r2(avg((h) => h.net));
  const mem = r2(avg((h) => h.mem));
  const gpuVals = hs.map((h) => h.gpu).filter((v): v is number => v != null);
  const gpu = gpuVals.length ? r2(gpuVals.reduce((s, v) => s + v, 0) / gpuVals.length) : null;
  const entries: [string, number][] = [["cpu", cpu], ["network", net], ["memory", mem]];
  if (gpu != null) entries.push(["gpu", gpu]);
  const dominant = entries.reduce((m, e) => (e[1] < m[1] ? e : m))[0];
  return { cpu, net, mem, gpu, dominant };
}
