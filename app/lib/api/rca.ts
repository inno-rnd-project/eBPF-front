import { api, toSearchParams } from "./client";
import type { RcaResponse } from "./types";

export type RcaParams = {
  /** alertname — 생략 시 전체 목록, 미보관 alert 는 404 */
  alert?: string;
};

export function fetchRca(params: RcaParams = {}) {
  return api
    .get("rca", { searchParams: toSearchParams(params) })
    .json<RcaResponse>();
}
