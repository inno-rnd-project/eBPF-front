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
};
