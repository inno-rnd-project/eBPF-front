export const apiQueryKeys = {
  all: ["api"] as const,
  inventory: () => [...apiQueryKeys.all, "inventory"] as const,
  nodes: () => [...apiQueryKeys.inventory(), "nodes"] as const,
  pods: (namespace?: string) => [...apiQueryKeys.inventory(), "pods", namespace ?? "all"] as const,
};
