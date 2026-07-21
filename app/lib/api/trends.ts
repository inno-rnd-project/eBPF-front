import { api, toSearchParams } from "./client";
import type { TrendSignal, TrendsResponse } from "./types";

export type TrendsParams = {
  /** 추이 신호 (필수) */
  signal: TrendSignal;
  /** 조회 기간 (예: 1h, 6h, 최대 24h, 기본 1h) */
  range?: string;
  /** 샘플 간격 (예: 5m, 최소 30s, 기본 5m) */
  step?: string;
};

export function fetchTrends(params: TrendsParams) {
  return api
    .get("trends", { searchParams: toSearchParams(params) })
    .json<TrendsResponse>();
}
