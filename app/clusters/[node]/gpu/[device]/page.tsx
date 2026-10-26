"use client";

// ───────────────────────────────────────────────────────────────────────────
// GPU 디바이스 상세 — 실 API (react-query, 30s 갱신)
//   텔레메트리 = /gpu-status · PID = /gpu-processes · verdict = /gpu-rca · NIC = /bandwidth
// ───────────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import { use } from "react";

import { isNotFoundError } from "../../../../lib/api/client";
import { idleCauseOf, toDeviceProcesses, toDeviceVerdict } from "../../../../lib/api/gpu-device-view";
import { nicLinkOf, toGpuInfo, toNodeDisplayStatus } from "../../../../lib/api/node-view";
import {
  useAgentsQuery,
  useBandwidthQuery,
  useGpuProcessesQuery,
  useGpuRcaQuery,
  useGpuStatusQuery,
  useNodeDetailQuery,
  useNodeMapQuery,
} from "../../../../lib/api/queries";
import { GpuDeviceDetail } from "../../../../lib/charts";
import { DISPLAY_STATUS_TONE } from "../../../../lib/cluster";
import { AppShell, EntityHeader } from "../../../../lib/shell";

const SEV_DOT: Record<string, string> = { ok: "#5bb85b", warn: "#e8923b", crit: "#dc4a3d" };
const SEV_LABEL: Record<string, string> = { ok: "정상", warn: "경고", crit: "심각" };

export default function GpuDevicePage({ params }: { params: Promise<{ node: string; device: string }> }) {
  const p = use(params);
  const nodeName = decodeURIComponent(p.node);
  const deviceParam = decodeURIComponent(p.device);

  const mapQuery = useNodeMapQuery({ node: nodeName });
  const nodeDetailQuery = useNodeDetailQuery(nodeName);
  const statusQuery = useGpuStatusQuery({ node: nodeName });
  const processesQuery = useGpuProcessesQuery({ node: nodeName });
  const rcaQuery = useGpuRcaQuery({ node: nodeName, gpu: deviceParam });
  const agentsQuery = useAgentsQuery({ node: nodeName });
  const bandwidthQuery = useBandwidthQuery({ node: nodeName, limit: 1 });

  if (mapQuery.isError && isNotFoundError(mapQuery.error)) notFound();
  const mapNode = mapQuery.data?.nodes.find((n) => n.name === nodeName);
  if (mapNode && !mapNode.gpu) notFound();

  if (mapQuery.isPending || statusQuery.isPending) {
    return <PageLoading node={nodeName} device={deviceParam} message="GPU 텔레메트리를 불러오는 중…" />;
  }
  if (!statusQuery.data) {
    return <PageLoading node={nodeName} device={deviceParam} message="GPU 텔레메트리를 불러오지 못했습니다." error />;
  }

  const gpu = toGpuInfo(
    statusQuery.data,
    agentsQuery.data?.agents.find((a) => a.agent === "gpuobs"),
    nicLinkOf(bandwidthQuery.data, nodeName),
  );
  const index = Number(deviceParam);
  const baseView = gpu.views.find((v) => v.device.index === index);
  if (!baseView) notFound();

  // 디바이스 전용 실측 — PID 프로세스, RCA 기반 idle 원인/verdict
  const processes = toDeviceProcesses(processesQuery.data, index);
  const dominantCause = baseView.idle ? idleCauseOf(rcaQuery.data) : "none";
  const view = {
    ...baseView,
    processes: processes.length ? processes : baseView.processes,
    dominantCause,
  };
  view.verdict = toDeviceVerdict(baseView.verdict, view, rcaQuery.data);
  // 프로세스 목록이 수집되면(PID) 표시 — 파드 귀속 여부는 행의 pod 열("—")로 드러난다
  const perPodAvailable = gpu.perPodAvailable || (!!processesQuery.data?.available && processes.length > 0);

  const d = view.device;
  const sev = view.verdict.severity;
  const nodeTone = DISPLAY_STATUS_TONE[toNodeDisplayStatus(nodeDetailQuery.data, mapNode)];

  return (
    <AppShell
      crumbs={[
        { label: "Anomaly Map", href: "/" },
        { label: nodeName, href: `/clusters/${nodeName}`, dot: nodeTone.dot },
        { label: `GPU ${d.index}`, dot: SEV_DOT[sev] },
      ]}
    >
      <div className="space-y-6">
        {/* 디바이스 신원 — DCGM 관례: 디바이스 = node(instance) + gpu index. 제원은 facts 로. */}
        <EntityHeader
          kind="GPU 디바이스"
          title={`GPU ${d.index}`}
          statusDot={SEV_DOT[sev]}
          statusLabel={SEV_LABEL[sev] ?? sev}
          pills={
            <>
              <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">{d.model}</span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{view.verdict.modeLabel}</span>
            </>
          }
          facts={[
            { label: "VRAM", value: `${(d.memTotalMB / 1024).toFixed(0)} GB` },
            { label: "Power limit", value: `${d.powerLimitW} W` },
            { label: "Thermal", value: `slowdown ${d.tempSlowdownC}° · shutdown ${d.tempShutdownC}°` },
          ]}
        />

        {/* ── 디바이스 관점 (텔레메트리/프로세스/CUDA/메모리/인터커넥트/이벤트) ── */}
        <GpuDeviceDetail view={view} perPodAvailable={perPodAvailable} agent={gpu.agent} node={nodeName} />
      </div>
    </AppShell>
  );
}

function PageLoading({ node, device, message, error }: { node: string; device: string; message: string; error?: boolean }) {
  return (
    <AppShell
      crumbs={[
        { label: "Anomaly Map", href: "/" },
        { label: node, href: `/clusters/${node}` },
        { label: `GPU ${device}` },
      ]}
    >
      <div className="mt-16 flex flex-col items-center gap-2 text-slate-400">
        {error ? null : <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />}
        <span className={`text-[13px] ${error ? "font-semibold text-slate-600" : ""}`}>{message}</span>
      </div>
    </AppShell>
  );
}
