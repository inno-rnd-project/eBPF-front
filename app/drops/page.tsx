import DropsView from "../components/views/DropsView";
import { getCluster } from "../lib/mock-cluster";
import { getDrops } from "../lib/mock-telemetry";

export default function DropsPage() {
  // Swap getDrops() for a real eBPF-agent (skb_drop) / Hubble query returning DropData.
  return <DropsView drops={getDrops()} pods={getCluster().pods} />;
}
