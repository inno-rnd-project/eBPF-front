import type {
  CrossLevelParams,
  CrossNodeInterferenceParams,
  ImpactGraphParams,
  ImpactPathsParams,
  NoisyNeighborParams,
  ServiceImpactParams,
} from "./impact";

export const apiQueryKeys = {
  all: ["api"] as const,
  inventory: () => [...apiQueryKeys.all, "inventory"] as const,
  nodes: () => [...apiQueryKeys.inventory(), "nodes"] as const,
  pods: (namespace?: string) => [...apiQueryKeys.inventory(), "pods", namespace ?? "all"] as const,
  nodeMap: (node?: string, at?: string | number) =>
    [...apiQueryKeys.inventory(), "node-map", node ?? "all", at ?? "now"] as const,
  meta: () => [...apiQueryKeys.all, "meta"] as const,
  agents: (node?: string, at?: string | number) =>
    [...apiQueryKeys.meta(), "agents", node ?? "all", at ?? "now"] as const,
  health: () => [...apiQueryKeys.meta(), "health"] as const,
  overview: (at?: string | number) => [...apiQueryKeys.meta(), "overview", at ?? "now"] as const,
  network: () => [...apiQueryKeys.all, "network"] as const,
  bandwidth: (namespace?: string, node?: string, limit?: number, at?: string | number) =>
    [
      ...apiQueryKeys.network(),
      "bandwidth",
      namespace ?? "all",
      node ?? "all",
      limit ?? "default",
      at ?? "now",
    ] as const,
  drops: (namespace?: string, node?: string, limit?: number, at?: string | number) =>
    [
      ...apiQueryKeys.network(),
      "drops",
      namespace ?? "all",
      node ?? "all",
      limit ?? "default",
      at ?? "now",
    ] as const,
  flows: (namespace?: string, direction?: string, limit?: number) =>
    [
      ...apiQueryKeys.network(),
      "flows",
      namespace ?? "all",
      direction ?? "all",
      limit ?? "default",
    ] as const,
  latencyBreakdown: (
    scope?: string,
    direction?: string,
    node?: string,
    limit?: number,
    at?: string | number,
  ) =>
    [
      ...apiQueryKeys.network(),
      "latency-breakdown",
      scope ?? "workload",
      direction ?? "all",
      node ?? "all",
      limit ?? "default",
      at ?? "now",
    ] as const,
  interference: () => [...apiQueryKeys.all, "interference"] as const,
  events: (minSeverity?: string, limit?: number) =>
    [
      ...apiQueryKeys.interference(),
      "events",
      minSeverity ?? "elevated",
      limit ?? "default",
    ] as const,
  incidents: (range?: string, step?: string, limit?: number, node?: string, pod?: string) =>
    [
      ...apiQueryKeys.interference(),
      "incidents",
      range ?? "1h",
      step ?? "1m",
      limit ?? "default",
      node ?? "all",
      pod ?? "all",
    ] as const,
  memory: (namespace?: string, limit?: number, at?: string | number) =>
    [
      ...apiQueryKeys.interference(),
      "memory",
      namespace ?? "all",
      limit ?? "default",
      at ?? "now",
    ] as const,
  nodeVitals: (node: string, at?: string | number) =>
    [...apiQueryKeys.interference(), "node-vitals", node, at ?? "now"] as const,
  nodeDetail: (node: string) => [...apiQueryKeys.interference(), "node", node] as const,
  nodePods: (node: string) => [...apiQueryKeys.interference(), "node", node, "pods"] as const,
  podDetail: (namespace: string, pod: string) =>
    [...apiQueryKeys.interference(), "pod", namespace, pod] as const,
  pressure: (
    dimension: string,
    scope?: string,
    node?: string,
    limit?: number,
    at?: string | number,
  ) =>
    [
      ...apiQueryKeys.interference(),
      "pressure",
      dimension,
      scope ?? "node",
      node ?? "all",
      limit ?? "default",
      at ?? "now",
    ] as const,
  topology: () => [...apiQueryKeys.interference(), "topology"] as const,
  // impact 계열은 필터 파라미터가 많아 params 객체를 키에 그대로 넣는다
  // (React Query 가 객체 키를 정렬해 해시하므로 순서·undefined 무관)
  impact: () => [...apiQueryKeys.all, "impact"] as const,
  crossLevel: (params: CrossLevelParams = {}) =>
    [...apiQueryKeys.impact(), "cross-level", params] as const,
  crossNodeInterference: (params: CrossNodeInterferenceParams = {}) =>
    [...apiQueryKeys.impact(), "cross-node-interference", params] as const,
  impactGraph: (params: ImpactGraphParams = {}) =>
    [...apiQueryKeys.impact(), "impact-graph", params] as const,
  impactPaths: (params: ImpactPathsParams = {}) =>
    [...apiQueryKeys.impact(), "impact-paths", params] as const,
  noisyNeighbor: (params: NoisyNeighborParams = {}) =>
    [...apiQueryKeys.impact(), "noisy-neighbor", params] as const,
  serviceImpact: (params: ServiceImpactParams = {}) =>
    [...apiQueryKeys.impact(), "service-impact", params] as const,
  gpu: () => [...apiQueryKeys.all, "gpu"] as const,
  gpuIdle: (scope?: string, node?: string, limit?: number, at?: string | number) =>
    [
      ...apiQueryKeys.gpu(),
      "idle",
      scope ?? "cluster",
      node ?? "all",
      limit ?? "default",
      at ?? "now",
    ] as const,
  gpuProcesses: (node: string) => [...apiQueryKeys.gpu(), "processes", node] as const,
  gpuRca: (node: string, gpu?: string, limit?: number, at?: string | number) =>
    [
      ...apiQueryKeys.gpu(),
      "rca",
      node,
      gpu ?? "all",
      limit ?? "default",
      at ?? "now",
    ] as const,
  gpuStatus: (node?: string, at?: string | number) =>
    [...apiQueryKeys.gpu(), "status", node ?? "all", at ?? "now"] as const,
  trends: (signal: string, range?: string, step?: string) =>
    [...apiQueryKeys.all, "trends", signal, range ?? "1h", step ?? "5m"] as const,
  rca: (alert?: string) => [...apiQueryKeys.all, "rca", alert ?? "all"] as const,
  playbooks: (cause?: string, at?: string | number) =>
    [...apiQueryKeys.all, "playbooks", cause ?? "all", at ?? "now"] as const,
};
