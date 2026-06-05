"use client";

import {
  type Cluster,
  type Node,
  type Pod,
  formatAge,
  formatCpu,
  formatMem,
  nodeUsage,
  podsOnNode,
} from "../lib/k8s";
import ResourceBar from "./ResourceBar";
import Honeycomb from "./Honeycomb";
import HexBadge from "./HexBadge";

interface NodeCardProps {
  cluster: Cluster;
  node: Node;
  now: number;
  /** pods passing the active namespace/search filter — others are dimmed */
  visibleUids: Set<string>;
  selectedUid: string | null;
  onSelectPod: (pod: Pod) => void;
  /** pods to flag with an alert ring (e.g. packet drops) */
  alertUids?: Set<string>;
}

const STATUS_META: Record<
  Node["status"],
  { dot: string; text: string; label: string; stroke: string }
> = {
  Ready: { dot: "bg-emerald-400", text: "text-emerald-300", label: "Ready", stroke: "#34d399" },
  NotReady: { dot: "bg-rose-500", text: "text-rose-300", label: "NotReady", stroke: "#f43f5e" },
  SchedulingDisabled: { dot: "bg-amber-400", text: "text-amber-300", label: "SchedulingDisabled", stroke: "#fbbf24" },
};

export default function NodeCard({
  cluster,
  node,
  now,
  visibleUids,
  selectedUid,
  onSelectPod,
  alertUids,
}: NodeCardProps) {
  const usage = nodeUsage(cluster, node);
  const pods = podsOnNode(cluster, node.name).sort((a, b) => a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name));
  const status = STATUS_META[node.status];
  const isControlPlane = node.role === "control-plane";

  return (
    <div className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/40 shadow-lg shadow-black/20">
      {/* header */}
      <div className="flex items-start gap-3 border-b border-zinc-800 px-4 py-3">
        <HexBadge
          size={46}
          fill={`${status.stroke}22`}
          stroke={status.stroke}
          label={isControlPlane ? "CP" : "W"}
          pulse={node.status !== "Ready"}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-zinc-100" title={node.name}>
            {node.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
            <span className={status.text}>{status.label}</span>
            <span>{node.internalIP}</span>
            <span>{node.kubeletVersion}</span>
            <span>up {formatAge(node.createdAt, now)}</span>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
            isControlPlane
              ? "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30"
              : "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30"
          }`}
        >
          {isControlPlane ? "control-plane" : "worker"}
        </span>
      </div>

      {/* resource bars */}
      <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-3">
        <ResourceBar
          label="CPU"
          pct={usage.cpuPct}
          detail={`${formatCpu(usage.cpuUsedMilli)} / ${formatCpu(node.cpuCapacityMilli)}`}
        />
        <ResourceBar
          label="Memory"
          pct={usage.memPct}
          detail={`${formatMem(usage.memUsedMi)} / ${formatMem(node.memCapacityMi)}`}
        />
        <ResourceBar label="Pods" pct={usage.podPct} detail={`${usage.podCount} / ${node.podCapacity}`} />
      </div>

      {/* pods */}
      <div className="px-4 pb-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Pods · {pods.length}
        </div>
        <Honeycomb
          pods={pods}
          visibleUids={visibleUids}
          selectedUid={selectedUid}
          onSelectPod={onSelectPod}
          alertUids={alertUids}
        />
      </div>
    </div>
  );
}
