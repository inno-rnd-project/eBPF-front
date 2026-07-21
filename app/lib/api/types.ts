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
  roles: string[];
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
};

export type NodeMapNode = {
  name: string;
  status: string;
  roles: string[];
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
  bpf_programs_loaded: number;
  bpf_programs_total: number;
  bpf_attach_failures_5m: number;
  nvml_errors_per_sec: number;
  informer_lag_seconds: number;
  cuda_driver_symbols: boolean;
  cuda_runtime_symbols: boolean;
  issues: string[];
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
