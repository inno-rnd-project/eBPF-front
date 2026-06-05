// ---------------------------------------------------------------------------
// Kubernetes domain model
//
// These types mirror the shape of the data we ultimately want from a real
// cluster (kube-apiserver / metrics-server). The mock data below produces the
// same shape, so swapping `getCluster()` for a real fetch later is the only
// change required on the UI side.
// ---------------------------------------------------------------------------

export type PodPhase = "Running" | "Pending" | "Succeeded" | "Failed" | "Unknown";
export type NodeStatus = "Ready" | "NotReady" | "SchedulingDisabled";
export type NodeRole = "control-plane" | "worker";

export interface Container {
  name: string;
  image: string;
  ready: boolean;
  restarts: number;
  /** millicores in use */
  cpuMilli: number;
  /** mebibytes in use */
  memMi: number;
}

export interface Pod {
  uid: string;
  name: string;
  namespace: string;
  phase: PodPhase;
  nodeName: string;
  podIP: string;
  /** unix seconds when the pod was created */
  createdAt: number;
  containers: Container[];
}

export interface Node {
  name: string;
  role: NodeRole;
  status: NodeStatus;
  internalIP: string;
  os: string;
  kubeletVersion: string;
  /** total allocatable cpu in millicores */
  cpuCapacityMilli: number;
  /** total allocatable memory in mebibytes */
  memCapacityMi: number;
  /** max schedulable pods */
  podCapacity: number;
  createdAt: number;
}

export interface Cluster {
  name: string;
  version: string;
  nodes: Node[];
  pods: Pod[];
}

// --- derived metric helpers ------------------------------------------------

export function podCpuMilli(pod: Pod): number {
  return pod.containers.reduce((sum, c) => sum + c.cpuMilli, 0);
}

export function podMemMi(pod: Pod): number {
  return pod.containers.reduce((sum, c) => sum + c.memMi, 0);
}

export function podRestarts(pod: Pod): number {
  return pod.containers.reduce((sum, c) => sum + c.restarts, 0);
}

export function podsOnNode(cluster: Cluster, nodeName: string): Pod[] {
  return cluster.pods.filter((p) => p.nodeName === nodeName);
}

export interface NodeUsage {
  cpuUsedMilli: number;
  memUsedMi: number;
  podCount: number;
  cpuPct: number;
  memPct: number;
  podPct: number;
}

export function nodeUsage(cluster: Cluster, node: Node): NodeUsage {
  const pods = podsOnNode(cluster, node.name);
  const cpuUsedMilli = pods.reduce((s, p) => s + podCpuMilli(p), 0);
  const memUsedMi = pods.reduce((s, p) => s + podMemMi(p), 0);
  return {
    cpuUsedMilli,
    memUsedMi,
    podCount: pods.length,
    cpuPct: Math.min(100, (cpuUsedMilli / node.cpuCapacityMilli) * 100),
    memPct: Math.min(100, (memUsedMi / node.memCapacityMi) * 100),
    podPct: Math.min(100, (pods.length / node.podCapacity) * 100),
  };
}

export function namespacesOf(cluster: Cluster): string[] {
  return Array.from(new Set(cluster.pods.map((p) => p.namespace))).sort();
}

/** Human readable age, e.g. "3d", "5h", "12m". */
export function formatAge(createdAt: number, now: number): string {
  const secs = Math.max(0, Math.floor(now - createdAt));
  const d = Math.floor(secs / 86400);
  if (d > 0) return `${d}d`;
  const h = Math.floor(secs / 3600);
  if (h > 0) return `${h}h`;
  const m = Math.floor(secs / 60);
  if (m > 0) return `${m}m`;
  return `${secs}s`;
}

export function formatCpu(milli: number): string {
  if (milli >= 1000) return `${(milli / 1000).toFixed(milli % 1000 === 0 ? 0 : 2)}`;
  return `${milli}m`;
}

export function formatMem(mi: number): string {
  if (mi >= 1024) return `${(mi / 1024).toFixed(1)} Gi`;
  return `${Math.round(mi)} Mi`;
}

export const PHASE_META: Record<
  PodPhase,
  { label: string; dot: string; text: string; ring: string; bg: string; hex: string }
> = {
  Running: { label: "Running", dot: "bg-emerald-400", text: "text-emerald-300", ring: "ring-emerald-500/40", bg: "bg-emerald-500/10", hex: "#34d399" },
  Pending: { label: "Pending", dot: "bg-amber-400", text: "text-amber-300", ring: "ring-amber-500/40", bg: "bg-amber-500/10", hex: "#fbbf24" },
  Succeeded: { label: "Succeeded", dot: "bg-sky-400", text: "text-sky-300", ring: "ring-sky-500/40", bg: "bg-sky-500/10", hex: "#38bdf8" },
  Failed: { label: "Failed", dot: "bg-rose-500", text: "text-rose-300", ring: "ring-rose-500/40", bg: "bg-rose-500/10", hex: "#f43f5e" },
  Unknown: { label: "Unknown", dot: "bg-zinc-400", text: "text-zinc-300", ring: "ring-zinc-500/40", bg: "bg-zinc-500/10", hex: "#a1a1aa" },
};
