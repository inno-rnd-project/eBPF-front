import { api, toSearchParams } from "./client";
import type { AgentsResponse, AtParam, HealthResponse, OverviewResponse } from "./types";

export type AgentsParams = {
  node?: string;
  at?: AtParam;
};

export type OverviewParams = {
  at?: AtParam;
};

export function fetchAgents(params: AgentsParams = {}) {
  return api
    .get("agents", { searchParams: toSearchParams(params) })
    .json<AgentsResponse>();
}

export function fetchClusterHealth() {
  return api.get("health").json<HealthResponse>();
}

export function fetchOverview(params: OverviewParams = {}) {
  return api
    .get("overview", { searchParams: toSearchParams(params) })
    .json<OverviewResponse>();
}
