import { api, toSearchParams } from "./client";
import type {
  AtParam,
  GpuIdleResponse,
  GpuIdleScope,
  GpuProcessesResponse,
  GpuRcaResponse,
  GpuStatusResponse,
} from "./types";

export type GpuIdleParams = {
  /** 기본 cluster */
  scope?: GpuIdleScope;
  /** scope=node 단일 노드 필터 (생략 시 전체 노드) */
  node?: string;
  /** scope=pod 상위 N victim (1-100, 기본 10) */
  limit?: number;
  at?: AtParam;
};

export type GpuProcessesParams = {
  /** 대상 노드 (필수) — 실시간 스냅샷 경로라 at 재구성은 미지원 */
  node: string;
};

export type GpuRcaParams = {
  /** 대상 노드 (필수) */
  node: string;
  /** 대상 device (GPU UUID 또는 device index, 생략 시 노드 전체) */
  gpu?: string;
  /** 원인 후보 상위 N (1-50, 기본 10) */
  limit?: number;
  at?: AtParam;
};

export type GpuStatusParams = {
  node?: string;
  at?: AtParam;
};

export function fetchGpuIdle(params: GpuIdleParams = {}) {
  return api
    .get("gpu-idle", { searchParams: toSearchParams(params) })
    .json<GpuIdleResponse>();
}

export function fetchGpuProcesses(params: GpuProcessesParams) {
  return api
    .get("gpu-processes", { searchParams: toSearchParams(params) })
    .json<GpuProcessesResponse>();
}

export function fetchGpuRca(params: GpuRcaParams) {
  return api
    .get("gpu-rca", { searchParams: toSearchParams(params) })
    .json<GpuRcaResponse>();
}

export function fetchGpuStatus(params: GpuStatusParams = {}) {
  return api
    .get("gpu-status", { searchParams: toSearchParams(params) })
    .json<GpuStatusResponse>();
}
