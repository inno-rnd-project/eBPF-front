import { api, toSearchParams } from "./client";
import type { AtParam, NodeMapResponse, NodesResponse, PodsResponse } from "./types";

export type PodsParams = {
  namespace?: string;
};

export type NodeMapParams = {
  /** 단일 노드 조회 — 미등록 노드는 404 */
  node?: string;
  at?: AtParam;
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

export function fetchNodeMap(params: NodeMapParams = {}) {
  return api
    .get("node-map", { searchParams: toSearchParams(params) })
    .json<NodeMapResponse>();
}
