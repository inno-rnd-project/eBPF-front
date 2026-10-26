/** 평가 시점: RFC3339 문자열 또는 unix seconds */
export type AtParam = string | number;

export type NodeCapacity = {
  cpu: number;
  memory_bytes: number;
  gpu?: number;
};

export type InventoryNode = {
  name: string;
  uid: string;
  internal_ip: string;
  external_ip?: string;
  ready: boolean;
  /** worker 노드는 백엔드가 필드 자체를 생략한다 */
  roles?: string[];
  kubelet_version: string;
  runtime_version: string;
  kernel_version: string;
  os_image: string;
  capacity: NodeCapacity;
};

export type NodesResponse = {
  generated_at: string;
  nodes: InventoryNode[];
};

export type InventoryPod = {
  namespace: string;
  pod: string;
  uid: string;
  pod_ip?: string;
  host_ip?: string;
  node: string;
  workload_kind?: string;
  workload_name?: string;
  priority_class?: string;
  phase: string;
  qos_class?: string;
  observed: boolean;
};

export type PodsResponse = {
  generated_at: string;
  pods: InventoryPod[];
};

export type PodMapStatus = "live" | "warning" | "down";

export type NodeMapPod = {
  namespace: string;
  pod: string;
  status: PodMapStatus;
  no_data: boolean;
  /** 이슈가 없으면 백엔드가 필드 자체를 생략한다 */
  issues?: string[];
  /** no_data 일 때만 — 예: no_traffic */
  no_data_reason?: string;
};

export type NodeMapNode = {
  name: string;
  status: string;
  /** control-plane 외 노드는 생략될 수 있다 */
  roles?: string[];
  gpu: boolean;
  gpu_devices: number;
  pod_count: number;
  pods: NodeMapPod[];
};

export type NodeMapResponse = {
  generated_at: string;
  summary: string;
  nodes: NodeMapNode[];
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

export type AgentStatus = "healthy" | "degraded";

export type AgentHealth = {
  agent: string;
  node: string;
  up: boolean;
  status: AgentStatus;
  /** netobs 전용 — gpuobs 응답에는 없다 */
  bpf_programs_loaded?: number;
  bpf_programs_total?: number;
  bpf_attach_failures_5m?: number;
  /** gpuobs 전용 — netobs 응답에는 없다 */
  nvml_errors_per_sec?: number;
  cuda_driver_symbols?: boolean;
  cuda_runtime_symbols?: boolean;
  informer_lag_seconds: number;
  /** 이슈가 없으면 생략 */
  issues?: string[];
};

export type AgentsResponse = {
  generated_at: string;
  summary: string;
  agents: AgentHealth[];
};

export type HealthDimensionKey = "cpu" | "gpu" | "memory" | "network";

export type HealthHotspot = {
  node: string;
  top_pod: string;
  pressure: number;
  severity: string;
};

export type HealthDimension = {
  health: number | null;
  status: string;
  hotspot: HealthHotspot | null;
};

export type HealthAnomaly = {
  dimension: string;
  severity: string;
  window: string;
  zscore: number;
};

export type DominantPressure = {
  dimension: string;
  node: string;
  pod: string;
  pressure: number;
};

export type WeakestSignal = {
  dimension: string;
  health: number | null;
  status: string;
};

export type HealthResponse = {
  generated_at: string;
  window: string;
  summary: string;
  cluster_health: number | null;
  dimensions: Record<HealthDimensionKey, HealthDimension>;
  weakest: WeakestSignal;
  dominant_pressure: DominantPressure | null;
  anomalies: HealthAnomaly[];
};

export type OverviewNodes = {
  total: number;
  healthy: number;
  warning: number;
  down: number;
};

export type OverviewPods = {
  total: number;
  live: number;
  no_data: number;
};

export type OverviewIssues = {
  total: number;
  critical: number;
  warning: number;
};

export type OverviewGpu = {
  nodes: number;
  devices: number;
};

export type OverviewResponse = {
  generated_at: string;
  summary: string;
  nodes: OverviewNodes;
  pods: OverviewPods;
  issues: OverviewIssues;
  gpu: OverviewGpu;
  weakest: WeakestSignal;
};

export type FlowDirection = "egress" | "ingress";

export type BandwidthNode = {
  node: string;
  rx_bytes_per_sec: number;
  tx_bytes_per_sec: number;
  /** NIC 관점 TX (RX 는 l4 관점만 수집) */
  nic_tx_bytes_per_sec: number;
  nic_capacity_bytes_per_sec: number;
  /** NIC capacity 대비 사용률 — NIC 포화 판단 근거 */
  nic_utilization: number;
};

export type BandwidthPod = {
  namespace: string;
  pod: string;
  node: string;
  rx_bytes_per_sec: number;
  tx_bytes_per_sec: number;
  nic_tx_bytes_per_sec: number;
};

export type BandwidthResponse = {
  generated_at: string;
  window: string;
  summary: string;
  /** namespace 필터와 무관한 클러스터 전체 합계 */
  nodes: BandwidthNode[];
  pods: BandwidthPod[];
};

export type DropEntry = {
  node: string;
  namespace: string;
  workload: string;
  dst_namespace?: string;
  dst_workload?: string;
  reason: string;
  category: string;
  stage: string;
  direction: string;
  drops_per_sec: number;
};

export type CiliumDrop = {
  node: string;
  reason: string;
  direction: string;
  drops_per_sec: number;
};

export type DropFlow = {
  node: string;
  namespace: string;
  pod: string;
  src_ip: string;
  src_port: string;
  dst_ip: string;
  dst_port: string;
  protocol: string;
  ip_version: string;
  reason: string;
  category: string;
  direction: string;
  drops_per_sec: number;
  last_seen_unix: number;
};

export type DropStack = {
  func: string;
  reason: string;
  category: string;
  drops_per_sec: number;
};

export type RetransEntry = {
  node: string;
  namespace: string;
  workload: string;
  dst_namespace?: string;
  dst_workload?: string;
  traffic_scope: string;
  retrans_per_sec: number;
};

export type DropsResponse = {
  generated_at: string;
  window: string;
  summary: string;
  drops: DropEntry[];
  /** CNI(BPF) 계층 drop — 커널 kfree_skb 경로의 사각, pod 귀속 없음 */
  cilium_drops: CiliumDrop[];
  /** allow-list 활성 시에만 flows/stacks 가 채워진다 */
  flow_detail_enabled: boolean;
  flows: DropFlow[];
  stacks: DropStack[];
  retrans: RetransEntry[];
};

export type FlowEdge = {
  node: string;
  src_namespace: string;
  src_pod: string;
  src_workload: string;
  dst_namespace: string;
  /** /pods 인벤토리의 uid 와 매핑 */
  dst_pod_uid: string;
  dst_ip: string;
  protocol: string;
  direction: string;
  bytes_per_sec: number;
  mbps: number;
};

export type FlowsResponse = {
  generated_at: string;
  window: string;
  summary: string;
  /** NETOBS_FLOW_ALLOW_NAMESPACES allow-list 활성 여부 */
  flow_collection_enabled: boolean;
  edges: FlowEdge[];
};

export type LatencyScope = "workload" | "node" | "pod";

export type LatencyStage = {
  stage: string;
  p99_seconds: number;
  share: number;
};

export type LatencyTcpState = {
  max_srtt_seconds: number;
  min_cwnd: number;
};

export type LatencyTarget = {
  node: string;
  /** scope 에 따라 생략될 수 있다 (node scope 등) */
  namespace?: string;
  workload?: string;
  pod?: string;
  dominant_stage: string;
  stages: LatencyStage[];
  tcp_state?: LatencyTcpState;
};

export type LatencyBreakdownResponse = {
  generated_at: string;
  window: string;
  summary: string;
  scope: string;
  direction: string;
  targets: LatencyTarget[];
};

export type EventSeverity = "low" | "elevated" | "high";

export type ClusterEvent = {
  id: string;
  /** anomaly 또는 noisy-neighbor */
  kind: string;
  dimension: string;
  severity: string;
  /** anomaly 계열의 정렬 축 */
  zscore?: number;
  /** noisy-neighbor 계열의 정렬 축 */
  causal_strength?: number;
  explanation: string;
  /** drill-down 링크 — 모든 링크에 관찰 시점 at 파라미터 포함 */
  links: Record<string, string>;
};

export type EventsResponse = {
  generated_at: string;
  window: string;
  summary: string;
  events: ClusterEvent[];
};

export type IncidentStatus = "firing" | "resolved";

export type IncidentEpisode = {
  alertname: string;
  title?: string;
  summary?: string;
  /** node/pod 스코프 — 해당 라벨이 있을 때만 */
  scope?: string;
  node?: string;
  pod?: string;
  component: string;
  severity: string;
  status: IncidentStatus;
  /** synthesis API 의 at 파라미터에 그대로 넣는 진입점 */
  starts_at: string;
  /** status=resolved 일 때만 채워진다 */
  ends_at?: string;
  labels: Record<string, string>;
  truncated: boolean;
};

export type IncidentsResponse = {
  generated_at: string;
  range: string;
  step: string;
  summary: string;
  incidents: IncidentEpisode[];
};

export type MemoryPod = {
  namespace: string;
  pod: string;
  node: string;
  working_set_bytes: number;
  /** anonymous 메모리 — OOM 유발 */
  rss_bytes: number;
  /** reclaimable — 압박 아님 */
  cache_bytes: number;
  /** 노드 swap 이 켜진 경우만 채워진다 */
  swap_bytes?: number;
  limit_bytes: number;
  /** working_set / limit */
  oom_risk: number;
  dominant_kind: string;
  severity: string;
};

export type MemoryResponse = {
  generated_at: string;
  window: string;
  summary: string;
  pods: MemoryPod[];
};

/** GET /node/{node}/pods — 노드 파드 자원 표 (limit 없는 pod 는 *_percent 필드 생략) */
export type NodePodResource = {
  namespace: string;
  pod: string;
  uid: string;
  phase: string;
  /** low/elevated/high */
  severity?: string;
  unmeasured_dimensions?: string[];
  /** 미관측 pod 만 채워진다 */
  unobserved_reason?: string;
  cpu_percent?: number;
  cpu_usage_cores?: number;
  memory_percent?: number;
  memory_working_set_bytes?: number;
  network_bytes_per_sec?: number;
};

export type NodePodsResponse = {
  generated_at: string;
  node: string;
  pods: NodePodResource[];
};

/** GET /pod/{namespace}/{pod} — 미관측 pod 는 필드 생략 + summary 사유 (404 아님) */
export type PodDetailResponse = {
  generated_at: string;
  summary: string;
  namespace: string;
  pod: string;
  uid?: string;
  node?: string;
  pod_ip?: string;
  created_by_kind?: string;
  created_by_name?: string;
  /** 1 - pod pressure score. 미산출 차원은 엔트리 생략 */
  health: Partial<Record<HealthDimensionKey, number>>;
  /** limit 이 없어 pressure 를 산출할 수 없는 차원 (cpu / memory) */
  unmeasured_dimensions?: string[];
  vitals: {
    cpu_percent?: number;
    cpu_usage_cores?: number;
    memory_percent?: number;
    memory_working_set_bytes?: number;
  };
  cpu: {
    /** 최근 5분 CFS period 중 throttle 비율 (0-1) */
    throttled_ratio?: number;
    throttled_periods_5m?: number;
    total_periods_5m?: number;
    limit_cores?: number;
    quota_microseconds?: number;
    period_microseconds?: number;
  };
  network: {
    drop_per_sec?: number;
    retrans_per_sec?: number;
    /** 분위수가 아닌 최대 smoothed RTT */
    max_srtt_seconds?: number;
  };
};

export type NodeVitalsResponse = {
  generated_at: string;
  summary: string;
  node: string;
  /** pod 사용량/limit 비율의 노드 평균 — limit 없는 pod 는 제외 */
  cpu_percent: number;
  cpu_usage_cores?: number;
  memory_percent: number;
  memory_working_set_bytes?: number;
  /** GPU 없는 노드는 생략될 수 있다 */
  gpu_percent?: number;
  gpu_memory_percent?: number;
  gpu_memory_used_bytes?: number;
  gpu_memory_total_bytes?: number;
};

export type NodeTopPod = {
  dimension: string;
  /** "namespace/pod" 결합 문자열 */
  pod: string;
  namespace?: string;
  pod_name?: string;
  pressure: number;
};

export type NodeDetailResponse = {
  generated_at: string;
  window: string;
  summary: string;
  node: string;
  status: string;
  /** healthy/warning/critical — pressure·alert 를 종합한 노드 단일 판정 */
  status_unified?: string;
  /** pressure 또는 alert — status 판정 근거 */
  status_basis?: string;
  /** status_basis=alert 일 때 판정에 쓰인 alertname */
  status_alerts?: string[];
  overall: number | null;
  dominant_dimension: string;
  /** 압박 top1 과 top2 차원 격차 — gpu-rca 와 동일 축 */
  confidence: number;
  /** 차원별 pressure — GPU 없는 노드는 gpu 키 생략 */
  pressure: Partial<Record<HealthDimensionKey, number>>;
  /** node:*_health_score:5m — cluster health 의 노드 차원 판 */
  health: Partial<Record<HealthDimensionKey, number>>;
  /** 측정 불가 사유 — 예: cpu=no_cpu_limit_pods, gpu=no_gpu */
  health_notes?: Partial<Record<HealthDimensionKey, string>>;
  top_pods: NodeTopPod[];
};

export type PressureScope = "node" | "pod";

export type PressureRankingEntry = {
  rank: number;
  node: string;
  /** scope=pod 일 때만 — 문서와 달리 "namespace/pod" 결합 문자열로 온다 */
  pod?: string;
  namespace?: string;
  pod_name?: string;
  pressure: number;
  severity: string;
};

export type PressureResponse = {
  generated_at: string;
  window: string;
  summary: string;
  dimension: string;
  scope: string;
  ranking: PressureRankingEntry[];
};

export type TopologyNode = {
  node: string;
  /** healthy/warning/critical/unknown — dominant severity 기준 */
  status: string;
  dominant_dimension: string;
  pressure: Partial<Record<HealthDimensionKey, number>>;
};

export type TopologyEdge = {
  suspect_node: string;
  victim_node: string;
  dimension: string;
  score: number;
};

export type TopologyResponse = {
  generated_at: string;
  window: string;
  summary: string;
  nodes: TopologyNode[];
  /** cross-node interference — querier/snapshot 없으면 빈 배열 */
  edges: TopologyEdge[];
};

/** pod 식별자 — /pods 인벤토리의 uid 와 매핑 */
export type PodRef = {
  namespace: string;
  pod: string;
  pod_uid: string;
};

export type PageInfo = {
  limit: number;
  offset: number;
  total: number;
};

/** victim 영향 종착 차원 */
export type VictimSignal = "latency" | "throughput" | "error" | "gpu";

export type CrossLevelDirection = "node_to_pod" | "pod_to_node";

export type CrossLevelItem = {
  rank: number;
  node: string;
  pod_namespace: string;
  pod: string;
  pod_uid: string;
  direction: CrossLevelDirection;
  dimension: HealthDimensionKey;
  score: number;
  p_value: number;
  granger_ok: boolean;
  lag_steps: number;
  sample_count: number;
  suspect_metric: string;
  victim_metric: string;
};

export type CrossLevelResponse = {
  items: CrossLevelItem[];
  page: PageInfo;
};

export type CrossNodeInterferenceItem = {
  rank: number;
  victim_node: string;
  suspect_node: string;
  dimension: HealthDimensionKey;
  score: number;
  p_value: number;
  granger_ok: boolean;
  lag_steps: number;
  sample_count: number;
  suspect_metric: string;
  victim_metric: string;
};

export type CrossNodeInterferenceResponse = {
  items: CrossNodeInterferenceItem[];
  page: PageInfo;
};

export type ImpactGraphNode = PodRef & {
  out_degree: number;
  in_degree: number;
};

export type ImpactGraphEdge = {
  suspect: PodRef;
  victim: PodRef;
  dimension: HealthDimensionKey;
  victim_signal: VictimSignal;
  score: number;
  p_value: number;
  granger_ok: boolean;
  lag_steps: number;
};

export type ImpactGraphResponse = {
  nodes: ImpactGraphNode[];
  edges: ImpactGraphEdge[];
  summary: {
    node_count: number;
    edge_count: number;
  };
};

export type ImpactHop = {
  suspect: PodRef;
  victim: PodRef;
  dimension: HealthDimensionKey;
  victim_signal: VictimSignal;
  score: number;
  lag_steps: number;
};

export type ImpactPath = {
  root: PodRef;
  terminal: PodRef;
  root_kind: string;
  depth: number;
  /** 경로 weakest-link score */
  score: number;
  hops: ImpactHop[];
};

export type ImpactRoot = {
  root: PodRef;
  kind: string;
  path_count: number;
  reach: number;
};

export type ImpactPathsResponse = {
  paths: ImpactPath[];
  roots: ImpactRoot[];
  summary: {
    path_count: number;
    root_count: number;
  };
};

export type NoisyNeighborItem = {
  rank: number;
  suspect: PodRef;
  victim: PodRef;
  dimension: HealthDimensionKey;
  victim_signal: VictimSignal;
  /** score 는 0 에 가까운 경우가 많아 실제 정렬 축은 causal_strength */
  score: number;
  causal_strength: number;
  p_value: number;
  granger_ok: boolean;
  lag_steps: number;
  sample_count: number;
  suspect_metric: string;
  victim_metric: string;
  impact_ok: boolean;
  impact_seconds: number;
  impact_magnitude: number;
  impact_magnitude_ok: boolean;
  impact_pvalue: number;
  impact_pvalue_ok: boolean;
};

export type NoisyNeighborResponse = {
  items: NoisyNeighborItem[];
  page: PageInfo;
};

export type ServiceImpactItem = {
  rank: number;
  victim_namespace: string;
  /** Service 근사 */
  victim_workload: string;
  suspect_node: string;
  dimension: HealthDimensionKey;
  score: number;
  p_value: number;
  granger_ok: boolean;
  lag_steps: number;
  sample_count: number;
  suspect_metric: string;
  victim_metric: string;
};

export type ServiceImpactResponse = {
  items: ServiceImpactItem[];
  page: PageInfo;
};

export type GpuIdleScope = "cluster" | "node" | "pod";

export type GpuIdleCause = {
  cause: string;
  description: string;
  weight: number;
};

export type GpuIdleAttribution = {
  causes: GpuIdleCause[];
  dominant_cause: string;
};

export type GpuIdleNode = {
  node: string;
  idle: number;
  severity: string;
};

export type GpuIdleNodeAttribution = GpuIdleAttribution & {
  node: string;
};

export type GpuIdleVictim = GpuIdleAttribution & {
  namespace: string;
  node: string;
  pod: string;
};

export type GpuIdleResponse = {
  generated_at: string;
  window: string;
  summary: string;
  scope: string;
  /** cause weight 는 GPU idle > 0.5 일 때만 산출 — 미만이면 null (graceful) */
  cluster: GpuIdleAttribution | null;
  nodes: GpuIdleNode[];
  /** scope=node 일 때만 채워진다 */
  node_attributions?: GpuIdleNodeAttribution[];
  /** scope=pod 일 때만 채워진다 */
  victims?: GpuIdleVictim[];
};

export type GpuProcess = {
  pid: number;
  gpu_index: number;
  gpu_uuid: string;
  /** compute 또는 graphics */
  type: string;
  memory_used_bytes: number;
  /** cgroup 기반 소유 pod — 귀속 실패 시 생략 */
  namespace?: string;
  pod?: string;
  /** best-effort */
  sm_util_percent?: number;
};

export type GpuProcessesResponse = {
  generated_at: string;
  collected_at: string;
  node: string;
  summary: string;
  /** agent 미존재/down/미응답이면 false + reason */
  available: boolean;
  reason?: string;
  processes: GpuProcess[];
};

export type GpuRcaEvidence = {
  gpu_utilization_percent?: number;
  sm_active_percent?: number;
  retrans_per_sec?: number;
  max_srtt_seconds?: number;
  /** 이하 dominant cause 의 차원 맞춤 수치 — 해당 cause 일 때만 채워진다 */
  node_memory_used_ratio?: number;
  suspect_memory_limit_ratio?: number;
  temperature_celsius?: number;
  slowdown_headroom_celsius?: number;
  cpu_throttle_ratio?: number;
  cause_score?: number;
};

export type GpuRcaSuspect = {
  dimension: string;
  /** cross-node-interference 발 suspect 는 node 만 있다 */
  namespace?: string;
  pod?: string;
  node: string;
  score: number;
  /** noisy-neighbor 또는 cross-node-interference */
  source: string;
  issues?: string[];
};

export type GpuRcaResponse = {
  generated_at: string;
  node: string;
  /** 요청한 대상 device (GPU UUID 또는 device index) */
  gpu?: string;
  idle: number;
  dominant_cause: string;
  causes: GpuIdleCause[];
  /** top1 과 top2 cause 격차 — 0.1 미만 백중세는 narrative 에 판정 유보 */
  confidence: number;
  evidence: GpuRcaEvidence;
  narrative: string;
  suspects: GpuRcaSuspect[];
};

export type GpuDevicePod = {
  namespace: string;
  pod: string;
  memory_used_bytes: number;
  utilization_percent?: number;
};

export type GpuPodAttribution = {
  /** CUDA pod 귀속 능력 — driver 심볼 필수, 불가 시 reason */
  available: boolean;
  reason?: string;
  /** runtime 심볼은 선택 */
  runtime_symbols: boolean;
};

/** 수집 공백 신호는 필드가 생략된다 */
export type GpuDevice = {
  node: string;
  gpu_index: string;
  gpu_uuid: string;
  model: string;
  /** 성능성 throttle 은 degraded, slowdown 임계 근접·NVML 오류율 초과는 warning */
  status: string;
  /** 백엔드 idle 판정 */
  idle?: boolean;
  utilization_percent?: number;
  /** gpm sm_occupancy — 데이터센터 GPU 에서만 채워진다 */
  sm_active_percent?: number;
  encoder_utilization_percent?: number;
  decoder_utilization_percent?: number;
  memory_used_bytes?: number;
  memory_total_bytes?: number;
  memory_used_ratio?: number;
  bar1_memory_used_bytes?: number;
  bar1_memory_total_bytes?: number;
  power_usage_watts?: number;
  power_limit_watts?: number;
  power_limit_enforced_watts?: number;
  energy_consumption_joules?: number;
  temperature_celsius?: number;
  temperature_thresholds_celsius?: Record<string, number>;
  fan_speed_percent?: number;
  clocks_mhz?: Record<string, number>;
  performance_state?: number;
  pcie_link_generation?: number;
  pcie_link_width?: number;
  pcie_rx_bytes_per_second?: number;
  pcie_tx_bytes_per_second?: number;
  compute_mode?: number;
  persistence_mode?: number;
  throttle_reasons?: string[];
  throttle_violation_seconds?: number;
  pod_attribution: GpuPodAttribution;
  pods: GpuDevicePod[];
};

export type GpuStatusResponse = {
  generated_at: string;
  summary: string;
  devices: GpuDevice[];
};

/** 추이 신호 화이트리스트 — 임의 PromQL injection 통제, 신호당 1 시리즈 bound */
export type TrendSignal =
  | "noisy_neighbor_intensity"
  | "noisy_neighbor_count"
  | "cross_node_intensity"
  | "service_impact_intensity"
  | "latency_p99"
  | "drop_rate"
  | "bandwidth_rx"
  | "bandwidth_tx"
  | "pressure_max"
  | "retrans_rate"
  | "srtt_max";

export type TrendPoint = {
  timestamp_ms: number;
  value: number;
};

export type TrendSeries = {
  labels: Record<string, string>;
  points: TrendPoint[];
};

export type TrendsResponse = {
  generated_at: string;
  signal: string;
  range: string;
  step: string;
  summary: string;
  series: TrendSeries[];
};

/**
 * rca-summarizer 프록시 응답 — 스키마가 고정되지 않은 자유형 객체.
 * alert 생략 시 alertname 키의 전체 요약 목록, 지정 시 해당 alert 의 최신 요약.
 * 지배 자원 차원, 최우선 의심 pod, 핵심 drop flow, 근거 메트릭 힌트, 신뢰도 점수를 담는다.
 */
export type RcaResponse = Record<string, unknown>;

export type PlaybookCheck = {
  /** 확인 절차 API 경로 — at 지원 경로는 요청의 at 이 이어 붙는다 */
  api: string;
  description: string;
};

export type Playbook = {
  cause: string;
  /** gpu-idle cause / drop stage / 이벤트 dimension / alertname 구분 */
  kind: string;
  title: string;
  description: string;
  /** GPUIdleWith* 같은 alertname 별칭 */
  aliases?: string[];
  checks: PlaybookCheck[];
  actions: string[];
};

export type PlaybooksResponse = {
  generated_at: string;
  summary: string;
  playbooks: Playbook[];
};
