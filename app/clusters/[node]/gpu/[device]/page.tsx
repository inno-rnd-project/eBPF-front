import { notFound } from "next/navigation";

import { DISPLAY_STATUS_TONE, getNode, nodeDisplayStatus, nodeGpu } from "../../../../lib/cluster";
import { GpuDeviceDetail } from "../../../../lib/charts";
import { AppShell, EntityHeader } from "../../../../lib/shell";

const SEV_DOT: Record<string, string> = { ok: "#5bb85b", warn: "#e8923b", crit: "#dc4a3d" };
const SEV_LABEL: Record<string, string> = { ok: "정상", warn: "경고", crit: "심각" };

export default async function GpuDevicePage({ params }: { params: Promise<{ node: string; device: string }> }) {
  const { node: nodeName, device: deviceParam } = await params;
  const node = getNode(decodeURIComponent(nodeName));
  if (!node) notFound();

  const gpu = nodeGpu(node);
  if (!gpu) notFound();

  const index = Number(decodeURIComponent(deviceParam));
  const view = gpu.views.find((v) => v.device.index === index);
  if (!view) notFound();

  const d = view.device;
  const sev = view.verdict.severity;
  const nodeTone = DISPLAY_STATUS_TONE[nodeDisplayStatus(node)];

  return (
    <AppShell
      crumbs={[
        { label: "Anomaly Map", href: "/" },
        { label: node.name, href: `/clusters/${node.name}`, dot: nodeTone.dot },
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
        <GpuDeviceDetail view={view} perPodAvailable={gpu.perPodAvailable} agent={gpu.agent} node={node.name} />
      </div>
    </AppShell>
  );
}
