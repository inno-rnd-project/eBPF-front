import LatencyView from "../components/views/LatencyView";
import { getLatency } from "../lib/mock-telemetry";

export default function LatencyPage() {
  // Swap getLatency() for a real eBPF-agent / Prometheus query returning LatencyData.
  return <LatencyView latency={getLatency()} />;
}
