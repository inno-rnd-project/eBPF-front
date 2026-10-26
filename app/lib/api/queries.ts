"use client";

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

import {
  fetchCrossLevel,
  fetchCrossNodeInterference,
  fetchImpactGraph,
  fetchImpactPaths,
  fetchNoisyNeighbor,
  fetchServiceImpact,
} from "./impact";
import type {
  CrossLevelParams,
  CrossNodeInterferenceParams,
  ImpactGraphParams,
  ImpactPathsParams,
  NoisyNeighborParams,
  ServiceImpactParams,
} from "./impact";
import { isNotFoundError } from "./client";
import {
  fetchEvents,
  fetchIncidents,
  fetchMemory,
  fetchNodeDetail,
  fetchNodePods,
  fetchNodeVitals,
  fetchPodDetail,
  fetchPressure,
  fetchTopology,
} from "./interference";
import type {
  EventsParams,
  IncidentsParams,
  MemoryParams,
  NodeVitalsParams,
  PressureParams,
} from "./interference";
import { fetchNodeMap, fetchNodesInventory, fetchPodsInventory } from "./inventory";
import type { NodeMapParams } from "./inventory";
import { fetchGpuIdle, fetchGpuProcesses, fetchGpuRca, fetchGpuStatus } from "./gpu";
import type {
  GpuIdleParams,
  GpuProcessesParams,
  GpuRcaParams,
  GpuStatusParams,
} from "./gpu";
import { fetchAgents, fetchClusterHealth, fetchOverview } from "./meta";
import type { AgentsParams, OverviewParams } from "./meta";
import {
  fetchBandwidth,
  fetchDrops,
  fetchFlows,
  fetchLatencyBreakdown,
} from "./network";
import type {
  BandwidthParams,
  DropsParams,
  FlowsParams,
  LatencyBreakdownParams,
} from "./network";
import { fetchPlaybooks } from "./playbooks";
import type { PlaybooksParams } from "./playbooks";
import { apiQueryKeys } from "./query-keys";
import { fetchRca } from "./rca";
import type { RcaParams } from "./rca";
import { fetchTrends } from "./trends";
import type { TrendsParams } from "./trends";

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
    // 미등록 노드 404 는 재시도해도 같은 결과 — 즉시 실패시켜 드릴다운이 notFound() 로 빠지게 한다
    retry: (count, error) => !isNotFoundError(error) && count < 3,
  });
}

export function podDetailQueryOptions(namespace: string, pod: string) {
  return queryOptions({
    queryKey: apiQueryKeys.podDetail(namespace, pod),
    queryFn: () => fetchPodDetail(namespace, pod),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function nodePodsQueryOptions(node: string) {
  return queryOptions({
    queryKey: apiQueryKeys.nodePods(node),
    queryFn: () => fetchNodePods(node),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function bandwidthQueryOptions(params: BandwidthParams = {}) {
  const pinned = params.at !== undefined;
  return queryOptions({
    queryKey: apiQueryKeys.bandwidth(params.namespace, params.node, params.limit, params.at),
    queryFn: () => fetchBandwidth(params),
    staleTime: pinned ? Infinity : 30_000,
    refetchInterval: pinned ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}

export function dropsQueryOptions(params: DropsParams = {}) {
  const pinned = params.at !== undefined;
  return queryOptions({
    queryKey: apiQueryKeys.drops(params.namespace, params.node, params.limit, params.at),
    queryFn: () => fetchDrops(params),
    staleTime: pinned ? Infinity : 30_000,
    refetchInterval: pinned ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}

export function flowsQueryOptions(params: FlowsParams = {}) {
  // flows 는 at 파라미터가 없어 항상 현재 시점 기준으로 갱신한다.
  return queryOptions({
    queryKey: apiQueryKeys.flows(params.namespace, params.direction, params.limit),
    queryFn: () => fetchFlows(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function latencyBreakdownQueryOptions(params: LatencyBreakdownParams = {}) {
  const pinned = params.at !== undefined;
  return queryOptions({
    queryKey: apiQueryKeys.latencyBreakdown(
      params.scope,
      params.direction,
      params.node,
      params.limit,
      params.at,
    ),
    queryFn: () => fetchLatencyBreakdown(params),
    staleTime: pinned ? Infinity : 30_000,
    refetchInterval: pinned ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}

export function eventsQueryOptions(params: EventsParams = {}) {
  return queryOptions({
    queryKey: apiQueryKeys.events(params.min_severity, params.limit),
    queryFn: () => fetchEvents(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function incidentsQueryOptions(params: IncidentsParams = {}) {
  return queryOptions({
    queryKey: apiQueryKeys.incidents(
      params.range,
      params.step,
      params.limit,
      params.node,
      params.pod,
    ),
    queryFn: () => fetchIncidents(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function memoryQueryOptions(params: MemoryParams = {}) {
  const pinned = params.at !== undefined;
  return queryOptions({
    queryKey: apiQueryKeys.memory(params.namespace, params.limit, params.at),
    queryFn: () => fetchMemory(params),
    staleTime: pinned ? Infinity : 30_000,
    refetchInterval: pinned ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}

export function nodeVitalsQueryOptions(params: NodeVitalsParams) {
  const pinned = params.at !== undefined;
  return queryOptions({
    queryKey: apiQueryKeys.nodeVitals(params.node, params.at),
    queryFn: () => fetchNodeVitals(params),
    staleTime: pinned ? Infinity : 30_000,
    refetchInterval: pinned ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}

export function nodeDetailQueryOptions(node: string) {
  return queryOptions({
    queryKey: apiQueryKeys.nodeDetail(node),
    queryFn: () => fetchNodeDetail(node),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function pressureQueryOptions(params: PressureParams) {
  const pinned = params.at !== undefined;
  return queryOptions({
    queryKey: apiQueryKeys.pressure(
      params.dimension,
      params.scope,
      params.node,
      params.limit,
      params.at,
    ),
    queryFn: () => fetchPressure(params),
    staleTime: pinned ? Infinity : 30_000,
    refetchInterval: pinned ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}

export function topologyQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.topology(),
    queryFn: fetchTopology,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function crossLevelQueryOptions(params: CrossLevelParams = {}) {
  return queryOptions({
    queryKey: apiQueryKeys.crossLevel(params),
    queryFn: () => fetchCrossLevel(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function crossNodeInterferenceQueryOptions(params: CrossNodeInterferenceParams = {}) {
  return queryOptions({
    queryKey: apiQueryKeys.crossNodeInterference(params),
    queryFn: () => fetchCrossNodeInterference(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function impactGraphQueryOptions(params: ImpactGraphParams = {}) {
  return queryOptions({
    queryKey: apiQueryKeys.impactGraph(params),
    queryFn: () => fetchImpactGraph(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function impactPathsQueryOptions(params: ImpactPathsParams = {}) {
  return queryOptions({
    queryKey: apiQueryKeys.impactPaths(params),
    queryFn: () => fetchImpactPaths(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function noisyNeighborQueryOptions(params: NoisyNeighborParams = {}) {
  return queryOptions({
    queryKey: apiQueryKeys.noisyNeighbor(params),
    queryFn: () => fetchNoisyNeighbor(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function serviceImpactQueryOptions(params: ServiceImpactParams = {}) {
  return queryOptions({
    queryKey: apiQueryKeys.serviceImpact(params),
    queryFn: () => fetchServiceImpact(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function gpuIdleQueryOptions(params: GpuIdleParams = {}) {
  const pinned = params.at !== undefined;
  return queryOptions({
    queryKey: apiQueryKeys.gpuIdle(params.scope, params.node, params.limit, params.at),
    queryFn: () => fetchGpuIdle(params),
    staleTime: pinned ? Infinity : 30_000,
    refetchInterval: pinned ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}

export function gpuProcessesQueryOptions(params: GpuProcessesParams) {
  // 실시간 스냅샷 경로 — at 시점 재구성 미지원이라 항상 현재 기준으로 갱신한다.
  return queryOptions({
    queryKey: apiQueryKeys.gpuProcesses(params.node),
    queryFn: () => fetchGpuProcesses(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function gpuRcaQueryOptions(params: GpuRcaParams) {
  const pinned = params.at !== undefined;
  return queryOptions({
    queryKey: apiQueryKeys.gpuRca(params.node, params.gpu, params.limit, params.at),
    queryFn: () => fetchGpuRca(params),
    staleTime: pinned ? Infinity : 30_000,
    refetchInterval: pinned ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}

export function gpuStatusQueryOptions(params: GpuStatusParams = {}) {
  const pinned = params.at !== undefined;
  return queryOptions({
    queryKey: apiQueryKeys.gpuStatus(params.node, params.at),
    queryFn: () => fetchGpuStatus(params),
    staleTime: pinned ? Infinity : 30_000,
    refetchInterval: pinned ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}

export function trendsQueryOptions(params: TrendsParams) {
  return queryOptions({
    queryKey: apiQueryKeys.trends(params.signal, params.range, params.step),
    queryFn: () => fetchTrends(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function rcaQueryOptions(params: RcaParams = {}) {
  return queryOptions({
    queryKey: apiQueryKeys.rca(params.alert),
    queryFn: () => fetchRca(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function playbooksQueryOptions(params: PlaybooksParams = {}) {
  // 정적 카탈로그 — 같은 (cause, at) 응답은 불변이므로 자동 갱신하지 않는다.
  return queryOptions({
    queryKey: apiQueryKeys.playbooks(params.cause, params.at),
    queryFn: () => fetchPlaybooks(params),
    staleTime: Infinity,
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

export function useNodePodsQuery(node: string) {
  return useQuery(nodePodsQueryOptions(node));
}

/** namespace 를 모르는 동안(node-map 로딩 중)은 비활성 */
export function usePodDetailQuery(namespace: string | undefined, pod: string) {
  return useQuery({ ...podDetailQueryOptions(namespace ?? "", pod), enabled: !!namespace });
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

export function useBandwidthQuery(params: BandwidthParams = {}) {
  return useQuery(bandwidthQueryOptions(params));
}

export function useDropsQuery(params: DropsParams = {}) {
  return useQuery(dropsQueryOptions(params));
}

export function useFlowsQuery(params: FlowsParams = {}) {
  return useQuery(flowsQueryOptions(params));
}

export function useLatencyBreakdownQuery(params: LatencyBreakdownParams = {}) {
  return useQuery(latencyBreakdownQueryOptions(params));
}

export function useEventsQuery(params: EventsParams = {}) {
  return useQuery(eventsQueryOptions(params));
}

export function useIncidentsQuery(params: IncidentsParams = {}) {
  return useQuery(incidentsQueryOptions(params));
}

export function useMemoryQuery(params: MemoryParams = {}) {
  return useQuery(memoryQueryOptions(params));
}

export function useNodeVitalsQuery(params: NodeVitalsParams) {
  return useQuery(nodeVitalsQueryOptions(params));
}

export function useNodeDetailQuery(node: string) {
  return useQuery(nodeDetailQueryOptions(node));
}

export function usePressureQuery(params: PressureParams) {
  return useQuery(pressureQueryOptions(params));
}

export function useTopologyQuery() {
  return useQuery(topologyQueryOptions());
}

export function useCrossLevelQuery(params: CrossLevelParams = {}) {
  return useQuery(crossLevelQueryOptions(params));
}

export function useCrossNodeInterferenceQuery(params: CrossNodeInterferenceParams = {}) {
  return useQuery(crossNodeInterferenceQueryOptions(params));
}

export function useImpactGraphQuery(params: ImpactGraphParams = {}) {
  return useQuery(impactGraphQueryOptions(params));
}

export function useImpactPathsQuery(params: ImpactPathsParams = {}) {
  return useQuery(impactPathsQueryOptions(params));
}

export function useNoisyNeighborQuery(params: NoisyNeighborParams = {}) {
  return useQuery(noisyNeighborQueryOptions(params));
}

export function useServiceImpactQuery(params: ServiceImpactParams = {}) {
  return useQuery(serviceImpactQueryOptions(params));
}

export function useGpuIdleQuery(params: GpuIdleParams = {}) {
  return useQuery(gpuIdleQueryOptions(params));
}

export function useGpuProcessesQuery(params: GpuProcessesParams) {
  return useQuery(gpuProcessesQueryOptions(params));
}

export function useGpuRcaQuery(params: GpuRcaParams) {
  return useQuery(gpuRcaQueryOptions(params));
}

export function useGpuStatusQuery(params: GpuStatusParams = {}) {
  return useQuery(gpuStatusQueryOptions(params));
}

export function useTrendsQuery(params: TrendsParams) {
  return useQuery(trendsQueryOptions(params));
}

export function useRcaQuery(params: RcaParams = {}) {
  return useQuery(rcaQueryOptions(params));
}

export function usePlaybooksQuery(params: PlaybooksParams = {}) {
  return useQuery(playbooksQueryOptions(params));
}
