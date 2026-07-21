// ───────────────────────────────────────────────────────────────────────────
// 백엔드 status 문자열 → 표시 상태 토큰 (맵/노드/파드 페이지 공용)
// ───────────────────────────────────────────────────────────────────────────

import type { NodeDisplayStatus } from "../cluster";
import type { NodeMapPod } from "./types";

// 노드 status — 백엔드가 판정한 문자열을 UI 상태 토큰으로 정규화
export function nodeDisplayStatusOf(status: string): NodeDisplayStatus {
  const s = status.toLowerCase();
  if (s === "down" || s === "notready" || s === "not_ready") return "down";
  if (s === "critical" || s === "crit") return "crit";
  if (s === "warning" || s === "warn" || s === "degraded") return "warn";
  return "ok";
}

// 파드 status — down(위험)/warning(경고)이 no_data(회색)보다 우선.
// 백엔드가 "down"으로 판정했다면 텔레메트리 유무와 무관하게 사건이다.
export function podDisplayStatusOf(pod: NodeMapPod): NodeDisplayStatus | "nodata" {
  if (pod.status === "down") return "crit";
  if (pod.status === "warning") return "warn";
  return pod.no_data ? "nodata" : "ok";
}

export const NODATA_TONE = { dot: "#94a3b8", label: "데이터 없음" };
