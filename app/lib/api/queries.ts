"use client";

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

import { fetchNodesInventory, fetchPodsInventory } from "./inventory";
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

export function useNodesQuery() {
  return useQuery(nodesQueryOptions());
}

export function usePodsQuery(namespace?: string) {
  return useQuery(podsQueryOptions(namespace));
}
