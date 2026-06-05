import ClusterDashboard from "./components/ClusterDashboard";
import { getCluster } from "./lib/mock-cluster";
import { getDrops, getGpu, getInterference, getLatency } from "./lib/mock-telemetry";
import { lastV } from "./lib/telemetry";

export default function Home() {
  // Server-side data sources. Swap each get*() for a real fetch (kube-apiserver +
  // metrics-server, eBPF agent / Prometheus, Hubble) returning the same shapes.
  const cluster = getCluster();
  const latency = getLatency();
  const drops = getDrops();
  const interference = getInterference();
  const gpu = getGpu();

  const lastPct = latency.percentiles[latency.percentiles.length - 1];
  const dropTotal = drops.events.reduce((s, e) => s + e.count, 0);
  const alertUids = Array.from(new Set(drops.events.map((e) => e.uid)));
  const topInterferer = interference.pods[0];
  const avgUtil =
    gpu.devices.reduce((s, d) => s + lastV(d.util), 0) / Math.max(1, gpu.devices.length);

  return (
    <ClusterDashboard
      cluster={cluster}
      p99={lastPct?.p99 ?? 0}
      dropTotal={dropTotal}
      alertUids={alertUids}
      topInterferer={topInterferer ? { pod: topInterferer.pod, score: topInterferer.score } : undefined}
      gpuIdlePct={100 - avgUtil}
    />
  );
}
