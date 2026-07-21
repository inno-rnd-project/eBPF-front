import { api, toSearchParams } from "./client";
import type {
  CrossLevelDirection,
  CrossLevelResponse,
  CrossNodeInterferenceResponse,
  HealthDimensionKey,
  ImpactGraphResponse,
  ImpactPathsResponse,
  NoisyNeighborResponse,
  ServiceImpactResponse,
  VictimSignal,
} from "./types";

/** top-N 랭킹 계열 공통 pagination 파라미터 */
type RankingPageParams = {
  /** max rank (기본 무제한) */
  rank_max?: number;
  /** 응답 item 최대 개수 (기본 100, 최대 1000) */
  limit?: number;
  /** 응답 시작 offset (기본 0) */
  offset?: number;
};

export type CrossLevelParams = RankingPageParams & {
  /** 공유 node 이름 필터 */
  node?: string;
  pod_namespace?: string;
  pod?: string;
  direction?: CrossLevelDirection;
  dimension?: HealthDimensionKey;
};

export type CrossNodeInterferenceParams = RankingPageParams & {
  victim_node?: string;
  suspect_node?: string;
  dimension?: HealthDimensionKey;
};

export type ImpactGraphParams = {
  /** suspect 또는 victim 이 이 namespace 인 엣지만 (유도 부분그래프) */
  namespace?: string;
  /** score 가 이 값 이상인 엣지만 */
  min_score?: number;
};

export type ImpactPathsParams = {
  /** 근원 suspect pod 이름 필터 */
  root_pod?: string;
  /** 종착 victim pod 이름 필터 */
  terminal_pod?: string;
  /** root 또는 terminal 의 namespace 필터 */
  namespace?: string;
  /** 경로 weakest-link score 하한 필터 */
  min_score?: number;
};

export type NoisyNeighborParams = RankingPageParams & {
  victim_namespace?: string;
  victim_pod?: string;
  suspect_namespace?: string;
  suspect_pod?: string;
  dimension?: HealthDimensionKey;
  victim_signal?: VictimSignal;
};

export type ServiceImpactParams = RankingPageParams & {
  victim_namespace?: string;
  /** victim workload (Service 근사) 이름 필터 */
  victim_workload?: string;
  suspect_node?: string;
  dimension?: HealthDimensionKey;
};

export function fetchCrossLevel(params: CrossLevelParams = {}) {
  return api
    .get("cross-level", { searchParams: toSearchParams(params) })
    .json<CrossLevelResponse>();
}

export function fetchCrossNodeInterference(params: CrossNodeInterferenceParams = {}) {
  return api
    .get("cross-node-interference", { searchParams: toSearchParams(params) })
    .json<CrossNodeInterferenceResponse>();
}

export function fetchImpactGraph(params: ImpactGraphParams = {}) {
  return api
    .get("impact-graph", { searchParams: toSearchParams(params) })
    .json<ImpactGraphResponse>();
}

export function fetchImpactPaths(params: ImpactPathsParams = {}) {
  return api
    .get("impact-paths", { searchParams: toSearchParams(params) })
    .json<ImpactPathsResponse>();
}

export function fetchNoisyNeighbor(params: NoisyNeighborParams = {}) {
  return api
    .get("noisy-neighbor", { searchParams: toSearchParams(params) })
    .json<NoisyNeighborResponse>();
}

export function fetchServiceImpact(params: ServiceImpactParams = {}) {
  return api
    .get("service-impact", { searchParams: toSearchParams(params) })
    .json<ServiceImpactResponse>();
}
