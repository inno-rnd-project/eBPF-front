import type { Cluster, Container, Node, Pod, PodPhase } from "./k8s";

// ---------------------------------------------------------------------------
// Deterministic mock cluster.
//
// Everything is generated from a fixed seed and fixed base timestamps so that
// server-rendered and client-rendered output match exactly (no hydration
// mismatch). To use a real cluster later, replace `getCluster()` with a fetch
// that returns the same `Cluster` shape.
// ---------------------------------------------------------------------------

// Fixed reference "now" used as the base for pod/node ages, in unix seconds.
// (2026-06-05T00:00:00Z) Kept constant so SSR === CSR.
export const BASE_NOW = 1_780_963_200;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0xeb9f);
const ri = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

interface WorkloadSpec {
  namespace: string;
  name: string;
  image: string;
  replicas: number;
  cpu: [number, number]; // millicores per container range
  mem: [number, number]; // Mi per container range
  containers?: number;
  phaseBias?: PodPhase; // override the usual Running
}

const WORKLOADS: WorkloadSpec[] = [
  { namespace: "kube-system", name: "kube-apiserver", image: "registry.k8s.io/kube-apiserver:v1.30.2", replicas: 1, cpu: [120, 260], mem: [380, 620] },
  { namespace: "kube-system", name: "etcd", image: "registry.k8s.io/etcd:3.5.12", replicas: 1, cpu: [80, 180], mem: [220, 420] },
  { namespace: "kube-system", name: "coredns", image: "registry.k8s.io/coredns/coredns:v1.11.1", replicas: 2, cpu: [15, 60], mem: [40, 110] },
  { namespace: "kube-system", name: "kube-proxy", image: "registry.k8s.io/kube-proxy:v1.30.2", replicas: 4, cpu: [8, 30], mem: [25, 70] },
  { namespace: "kube-system", name: "cilium-agent", image: "quay.io/cilium/cilium:v1.15.5", replicas: 4, cpu: [40, 120], mem: [120, 260], containers: 1 },
  { namespace: "monitoring", name: "prometheus", image: "quay.io/prometheus/prometheus:v2.52.0", replicas: 1, cpu: [120, 400], mem: [500, 1200] },
  { namespace: "monitoring", name: "grafana", image: "grafana/grafana:11.0.0", replicas: 1, cpu: [30, 90], mem: [120, 280] },
  { namespace: "monitoring", name: "node-exporter", image: "quay.io/prometheus/node-exporter:v1.8.1", replicas: 4, cpu: [5, 20], mem: [20, 50] },
  { namespace: "ingress-nginx", name: "ingress-nginx-controller", image: "registry.k8s.io/ingress-nginx/controller:v1.10.1", replicas: 2, cpu: [40, 140], mem: [120, 320] },
  { namespace: "default", name: "web-frontend", image: "ghcr.io/acme/web-frontend:2.8.1", replicas: 4, cpu: [60, 220], mem: [180, 420], containers: 2 },
  { namespace: "default", name: "api-gateway", image: "ghcr.io/acme/api-gateway:1.14.0", replicas: 3, cpu: [90, 300], mem: [220, 560] },
  { namespace: "default", name: "orders-service", image: "ghcr.io/acme/orders:3.2.0", replicas: 3, cpu: [80, 260], mem: [200, 480] },
  { namespace: "default", name: "payments-service", image: "ghcr.io/acme/payments:1.9.4", replicas: 2, cpu: [70, 240], mem: [200, 460] },
  { namespace: "default", name: "redis", image: "redis:7.2-alpine", replicas: 1, cpu: [20, 80], mem: [120, 300] },
  { namespace: "default", name: "postgres", image: "postgres:16.3", replicas: 1, cpu: [60, 200], mem: [400, 900] },
  { namespace: "default", name: "batch-import", image: "ghcr.io/acme/batch-import:0.7.2", replicas: 1, cpu: [10, 40], mem: [80, 200], phaseBias: "Succeeded" },
];

function shortId(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(rand() * chars.length)];
  return s;
}

function buildNodes(): Node[] {
  const nodes: Node[] = [];
  nodes.push({
    name: "cp-1.k8s.local",
    role: "control-plane",
    status: "Ready",
    internalIP: "10.0.1.10",
    os: "Ubuntu 22.04.4 LTS",
    kubeletVersion: "v1.30.2",
    cpuCapacityMilli: 4000,
    memCapacityMi: 8192,
    podCapacity: 110,
    createdAt: BASE_NOW - 86400 * 92,
  });
  const workerStatuses: Node["status"][] = ["Ready", "Ready", "SchedulingDisabled"];
  for (let i = 1; i <= 3; i++) {
    nodes.push({
      name: `worker-${i}.k8s.local`,
      role: "worker",
      status: i === 3 ? pick(workerStatuses) === "SchedulingDisabled" ? "Ready" : "Ready" : "Ready",
      internalIP: `10.0.1.${20 + i}`,
      os: "Ubuntu 22.04.4 LTS",
      kubeletVersion: "v1.30.2",
      cpuCapacityMilli: 8000,
      memCapacityMi: 16384,
      podCapacity: 110,
      createdAt: BASE_NOW - 86400 * (90 - i),
    });
  }
  return nodes;
}

function buildPods(nodes: Node[]): Pod[] {
  const workers = nodes.filter((n) => n.role === "worker");
  const controlPlane = nodes.filter((n) => n.role === "control-plane");
  const pods: Pod[] = [];
  let workerCursor = 0;

  for (const wl of WORKLOADS) {
    const systemNs = wl.namespace === "kube-system";
    for (let r = 0; r < wl.replicas; r++) {
      // kube-proxy / cilium / node-exporter are DaemonSets: one per node.
      const isDaemon = ["kube-proxy", "cilium-agent", "node-exporter"].includes(wl.name);
      let node: Node;
      if (isDaemon) {
        node = nodes[r % nodes.length];
      } else if (["kube-apiserver", "etcd"].includes(wl.name)) {
        node = controlPlane[0];
      } else {
        node = workers[workerCursor % workers.length];
        workerCursor++;
      }

      const containerCount = wl.containers ?? 1;
      const containers: Container[] = [];
      for (let c = 0; c < containerCount; c++) {
        const isSidecar = c > 0;
        containers.push({
          name: isSidecar ? `${wl.name}-sidecar` : wl.name,
          image: isSidecar ? "ghcr.io/acme/envoy-sidecar:1.30.0" : wl.image,
          ready: true,
          restarts: rand() < 0.18 ? ri(1, 5) : 0,
          cpuMilli: ri(wl.cpu[0], wl.cpu[1]),
          memMi: ri(wl.mem[0], wl.mem[1]),
        });
      }

      // Decide a phase. Mostly Running, with a few interesting exceptions.
      let phase: PodPhase = wl.phaseBias ?? "Running";
      if (!wl.phaseBias) {
        const roll = rand();
        if (roll < 0.04) phase = "Pending";
        else if (roll < 0.07) phase = "Failed";
      }
      if (phase === "Pending") {
        // pending pods aren't really scheduled / consuming
        containers.forEach((c) => {
          c.ready = false;
          c.cpuMilli = 0;
          c.memMi = 0;
        });
      }
      if (phase === "Failed") {
        containers.forEach((c) => {
          c.ready = false;
          c.restarts += ri(3, 12);
        });
      }
      if (phase === "Succeeded") {
        containers.forEach((c) => {
          c.ready = false;
          c.cpuMilli = 0;
          c.memMi = 0;
        });
      }

      const suffix = systemNs && (wl.name === "etcd" || wl.name === "kube-apiserver")
        ? node.name.split(".")[0]
        : `${shortId(9)}-${shortId(5)}`;

      pods.push({
        uid: shortId(8) + "-" + shortId(4),
        name: `${wl.name}-${suffix}`,
        namespace: wl.namespace,
        phase,
        nodeName: node.name,
        podIP: `10.244.${nodes.indexOf(node)}.${ri(2, 250)}`,
        createdAt: BASE_NOW - ri(60, 86400 * 14),
        containers,
      });
    }
  }
  return pods;
}

let cached: Cluster | null = null;

/**
 * Returns the cluster snapshot. Replace the body with a real API call
 * (kube-apiserver + metrics-server) returning the same `Cluster` shape.
 */
export function getCluster(): Cluster {
  if (cached) return cached;
  const nodes = buildNodes();
  const pods = buildPods(nodes);
  cached = {
    name: "prod-eu-west-1",
    version: "v1.30.2",
    nodes,
    pods,
  };
  return cached;
}
