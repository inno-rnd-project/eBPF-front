import InterferenceView from "../components/views/InterferenceView";
import { getInterference } from "../lib/mock-telemetry";

export default function InterferencePage() {
  // Swap getInterference() for real interference scoring (eBPF metrics →
  // Prometheus → Pearson correlation) returning InterferenceData.
  return <InterferenceView data={getInterference()} />;
}
