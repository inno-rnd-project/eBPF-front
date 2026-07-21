import { api, toSearchParams } from "./client";
import type { AtParam, PlaybooksResponse } from "./types";

export type PlaybooksParams = {
  /** 원인 식별자 (예: network_pressure, egress_qdisc, gpu, NetObsDropBurst) — 미등록은 404 */
  cause?: string;
  /** 확인 절차 링크에 결합할 평가 시점 */
  at?: AtParam;
};

export function fetchPlaybooks(params: PlaybooksParams = {}) {
  return api
    .get("playbooks", { searchParams: toSearchParams(params) })
    .json<PlaybooksResponse>();
}
