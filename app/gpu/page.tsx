import GpuView from "../components/views/GpuView";
import { getGpu } from "../lib/mock-telemetry";

export default function GpuPage() {
  // Swap getGpu() for real DCGM Exporter metrics (via Prometheus) + eBPF PCIe /
  // TCP-retransmit counters returning GpuData.
  return <GpuView data={getGpu()} />;
}
