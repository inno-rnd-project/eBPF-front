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
};

export type PodsResponse = {
  generated_at: string;
  pods: InventoryPod[];
};
