import { api, toSearchParams } from "./client";
import type {
  AtParam,
  EventSeverity,
  EventsResponse,
  HealthDimensionKey,
  IncidentsResponse,
  MemoryResponse,
  NodeDetailResponse,
  NodePodsResponse,
  NodeVitalsResponse,
  PodDetailResponse,
  PressureResponse,
  PressureScope,
  TopologyResponse,
} from "./types";

export type EventsParams = {
  /** 최소 severity (기본 elevated) — 미만 사건은 제외 */
  min_severity?: EventSeverity;
  /** 상위 N 사건 (1-50, 기본 20) */
  limit?: number;
};

export type IncidentsParams = {
  /** 조회 기간 (예: 1h, 6h, 최대 24h, 기본 1h) */
  range?: string;
  /** 샘플 간격 (예: 1m, 최소 30s, 기본 1m) */
  step?: string;
  /** 상위 N 에피소드 (1-200, 기본 50) */
  limit?: number;
  /** node 라벨이 이 노드를 가리키는 에피소드만 */
  node?: string;
  /** pod/src_pod/victim_pod 라벨이 이 pod 를 가리키는 에피소드만 */
  pod?: string;
};

export type MemoryParams = {
  namespace?: string;
  /** 상위 N pod (1-200, 기본 30) */
  limit?: number;
  at?: AtParam;
};

export type NodeVitalsParams = {
  /** 대상 노드 (필수) */
  node: string;
  at?: AtParam;
};

export type PressureParams = {
  /** 압박 차원 (필수) */
  dimension: HealthDimensionKey;
  /** 랭킹 입도 (기본 node) */
  scope?: PressureScope;
  node?: string;
  /** 상위 N (1-100, 기본 10) */
  limit?: number;
  at?: AtParam;
};

export function fetchEvents(params: EventsParams = {}) {
  return api
    .get("events", { searchParams: toSearchParams(params) })
    .json<EventsResponse>();
}

export function fetchIncidents(params: IncidentsParams = {}) {
  return api
    .get("incidents", { searchParams: toSearchParams(params) })
    .json<IncidentsResponse>();
}

export function fetchMemory(params: MemoryParams = {}) {
  return api
    .get("memory", { searchParams: toSearchParams(params) })
    .json<MemoryResponse>();
}

export function fetchNodeVitals(params: NodeVitalsParams) {
  return api
    .get("node-vitals", { searchParams: toSearchParams(params) })
    .json<NodeVitalsResponse>();
}

export function fetchNodeDetail(node: string) {
  return api.get(`node/${encodeURIComponent(node)}`).json<NodeDetailResponse>();
}

export function fetchPodDetail(namespace: string, pod: string) {
  return api
    .get(`pod/${encodeURIComponent(namespace)}/${encodeURIComponent(pod)}`)
    .json<PodDetailResponse>();
}

export function fetchNodePods(node: string) {
  return api.get(`node/${encodeURIComponent(node)}/pods`).json<NodePodsResponse>();
}

export function fetchPressure(params: PressureParams) {
  return api
    .get("pressure", { searchParams: toSearchParams(params) })
    .json<PressureResponse>();
}

export function fetchTopology() {
  return api.get("topology").json<TopologyResponse>();
}
