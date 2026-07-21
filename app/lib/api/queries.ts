"use client";

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

import { fetchNodeMap, fetchNodesInventory, fetchPodsInventory } from "./inventory";
import type { NodeMapParams } from "./inventory";
import { fetchAgents, fetchClusterHealth, fetchOverview } from "./meta";
import type { AgentsParams, OverviewParams } from "./meta";
import { apiQueryKeys } from "./query-keys";

export function nodesQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.nodes(),
    queryFn: fetchNodesInventory,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function podsQueryOptions(namespace?: string) {
  return queryOptions({
    queryKey: apiQueryKeys.pods(namespace),
    queryFn: () => fetchPodsInventory({ namespace }),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function agentsQueryOptions(params: AgentsParams = {}) {
  // at으로 고정한 과거 시점 응답은 불변이므로 자동 갱신하지 않는다.
  const pinned = params.at !== undefined;
  return queryOptions({
    queryKey: apiQueryKeys.agents(params.node, params.at),
    queryFn: () => fetchAgents(params),
    staleTime: pinned ? Infinity : 30_000,
    refetchInterval: pinned ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}

export function clusterHealthQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.health(),
    queryFn: fetchClusterHealth,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function overviewQueryOptions(params: OverviewParams = {}) {
  const pinned = params.at !== undefined;
  return queryOptions({
    queryKey: apiQueryKeys.overview(params.at),
    queryFn: () => fetchOverview(params),
    staleTime: pinned ? Infinity : 30_000,
    refetchInterval: pinned ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}

export function nodeMapQueryOptions(params: NodeMapParams = {}) {
  const pinned = params.at !== undefined;
  return queryOptions({
    queryKey: apiQueryKeys.nodeMap(params.node, params.at),
    queryFn: () => fetchNodeMap(params),
    staleTime: pinned ? Infinity : 30_000,
    refetchInterval: pinned ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useNodesQuery() {
  return useQuery(nodesQueryOptions());
}

export function usePodsQuery(namespace?: string) {
  return useQuery(podsQueryOptions(namespace));
}

export function useNodeMapQuery(params: NodeMapParams = {}) {
  return useQuery(nodeMapQueryOptions(params));
}

export function useAgentsQuery(params: AgentsParams = {}) {
  return useQuery(agentsQueryOptions(params));
}

export function useClusterHealthQuery() {
  return useQuery(clusterHealthQueryOptions());
}

export function useOverviewQuery(params: OverviewParams = {}) {
  return useQuery(overviewQueryOptions(params));
}
