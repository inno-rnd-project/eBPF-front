import { api, toSearchParams } from "./client";
import type {
  AtParam,
  BandwidthResponse,
  DropsResponse,
  FlowDirection,
  FlowsResponse,
  LatencyBreakdownResponse,
  LatencyScope,
} from "./types";

export type BandwidthParams = {
  /** src_namespace 필터 */
  namespace?: string;
  node?: string;
  /** 상위 N pod (합산 대역폭 내림차순, 기본 50) */
  limit?: number;
  at?: AtParam;
};

export type DropsParams = {
  namespace?: string;
  node?: string;
  /** 상위 N (1-100, 기본 20) */
  limit?: number;
  at?: AtParam;
};

export type FlowsParams = {
  namespace?: string;
  direction?: FlowDirection;
  /** 상위 N 엣지 (1-200, 기본 50) */
  limit?: number;
};

export type LatencyBreakdownParams = {
  /** 기본 workload — pod scope 는 send-path 단계만 수집 */
  scope?: LatencyScope;
  direction?: FlowDirection;
  node?: string;
  /** 상위 N 대상 (1-100, 기본 10) */
  limit?: number;
  at?: AtParam;
};

export function fetchBandwidth(params: BandwidthParams = {}) {
  return api
    .get("bandwidth", { searchParams: toSearchParams(params) })
    .json<BandwidthResponse>();
}

export function fetchDrops(params: DropsParams = {}) {
  return api
    .get("drops", { searchParams: toSearchParams(params) })
    .json<DropsResponse>();
}

export function fetchFlows(params: FlowsParams = {}) {
  return api
    .get("flows", { searchParams: toSearchParams(params) })
    .json<FlowsResponse>();
}

export function fetchLatencyBreakdown(params: LatencyBreakdownParams = {}) {
  return api
    .get("latency-breakdown", { searchParams: toSearchParams(params) })
    .json<LatencyBreakdownResponse>();
}
