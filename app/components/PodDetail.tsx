"use client";

import {
  type Pod,
  PHASE_META,
  formatAge,
  formatCpu,
  formatMem,
  podCpuMilli,
  podMemMi,
  podRestarts,
} from "../lib/k8s";

interface PodDetailProps {
  pod: Pod | null;
  now: number;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="truncate text-right font-medium text-zinc-200">{value}</span>
    </div>
  );
}

export default function PodDetail({ pod, now, onClose }: PodDetailProps) {
  const open = pod !== null;

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden
      />

      {/* drawer */}
      <aside
        className={`fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="Pod details"
      >
        {pod && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${PHASE_META[pod.phase].dot}`} />
                  <span className={`text-xs font-medium ${PHASE_META[pod.phase].text}`}>{pod.phase}</span>
                </div>
                <h2 className="mt-1 break-all font-semibold text-zinc-100">{pod.name}</h2>
                <div className="text-xs text-zinc-500">{pod.namespace}</div>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 rounded-md border border-zinc-800 px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <section className="divide-y divide-zinc-900">
                <Row label="Node" value={pod.nodeName} />
                <Row label="Pod IP" value={pod.podIP} />
                <Row label="Age" value={formatAge(pod.createdAt, now)} />
                <Row label="CPU" value={formatCpu(podCpuMilli(pod))} />
                <Row label="Memory" value={formatMem(podMemMi(pod))} />
                <Row label="Restarts" value={podRestarts(pod)} />
                <Row label="UID" value={<span className="font-mono text-xs">{pod.uid}</span>} />
              </section>

              <h3 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Containers · {pod.containers.length}
              </h3>
              <div className="space-y-2">
                {pod.containers.map((c) => (
                  <div key={c.name} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-200">{c.name}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          c.ready
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-zinc-700/40 text-zinc-400"
                        }`}
                      >
                        {c.ready ? "Ready" : "Not Ready"}
                      </span>
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] text-zinc-500">{c.image}</div>
                    <div className="mt-2 flex gap-4 text-xs text-zinc-400">
                      <span>CPU {formatCpu(c.cpuMilli)}</span>
                      <span>Mem {formatMem(c.memMi)}</span>
                      <span className={c.restarts > 0 ? "text-amber-400" : ""}>↻ {c.restarts}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
