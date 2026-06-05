"use client";

import { useMemo } from "react";
import { type Pod, PHASE_META, podRestarts } from "../lib/k8s";
import { hexPoints, layoutHoneycomb } from "../lib/hex";

interface HoneycombProps {
  pods: Pod[];
  visibleUids: Set<string>;
  selectedUid: string | null;
  onSelectPod: (pod: Pod) => void;
  /** pods to flag with a pulsing alert ring (e.g. packet drops / high latency) */
  alertUids?: Set<string>;
}

export default function Honeycomb({
  pods,
  visibleUids,
  selectedUid,
  onSelectPod,
  alertUids,
}: HoneycombProps) {
  const layout = useMemo(() => layoutHoneycomb(pods.length), [pods.length]);

  if (pods.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-800 py-6 text-center text-xs text-zinc-600">
        No pods scheduled
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="h-auto w-full"
      role="group"
      aria-label="Pod honeycomb"
    >
      {pods.map((pod, i) => {
        const cell = layout.cells[i];
        const meta = PHASE_META[pod.phase];
        const dimmed = visibleUids.size > 0 && !visibleUids.has(pod.uid);
        const selected = pod.uid === selectedUid;
        const alert = alertUids?.has(pod.uid) ?? false;
        const restarts = podRestarts(pod);
        return (
          <g
            key={pod.uid}
            className={`hex-cell ${dimmed ? "hex-dim" : ""}`}
            onClick={() => onSelectPod(pod)}
          >
            <polygon
              points={hexPoints(cell.cx, cell.cy, layout.R - 1.5)}
              fill={meta.hex}
              fillOpacity={selected ? 1 : 0.85}
              stroke={selected ? "#fafafa" : "#09090b"}
              strokeWidth={selected ? 2.5 : 1.5}
            />
            {/* alert ring (e.g. packet drops) */}
            {alert && (
              <polygon
                className="animate-pulse"
                points={hexPoints(cell.cx, cell.cy, layout.R + 0.5)}
                fill="none"
                stroke="#f43f5e"
                strokeWidth={2}
              />
            )}
            {/* restart / not-ready marker */}
            {restarts > 0 && pod.phase !== "Succeeded" && (
              <circle cx={cell.cx} cy={cell.cy} r={3} fill="#09090b" fillOpacity={0.55} />
            )}
            <title>
              {pod.namespace}/{pod.name} · {pod.phase}
              {restarts > 0 ? ` · ↻${restarts}` : ""}
            </title>
          </g>
        );
      })}
    </svg>
  );
}
