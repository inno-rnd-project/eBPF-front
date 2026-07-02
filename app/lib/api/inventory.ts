import { api } from "./client";
import type { NodesResponse, PodsResponse } from "./types";

export type PodsParams = {
  namespace?: string;
};

export function fetchNodesInventory() {
  return api.get("nodes").json<NodesResponse>();
}

export function fetchPodsInventory(params: PodsParams = {}) {
  return api
    .get("pods", {
      searchParams: params.namespace ? { namespace: params.namespace } : undefined,
    })
    .json<PodsResponse>();
}
