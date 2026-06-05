import { getCluster, BASE_NOW } from "./mock-cluster";
import { hashString, seeded } from "./rng";
import {
  DROP_REASONS,
  LATENCY_STAGES,
  WINDOW_MINUTES,
  type ContribKey,
  type CorrelationMatrix,
  type DropData,
  type DropEvent,
  type GpuBreakdownPoint,
  type GpuData,
  type GpuDevice,
  type GpuStateKey,
  type ImpactEdge,
  type InterferenceData,
  type InterferenceScore,
  type LatencyData,
  type LatencyStagePoint,
  type PodLatencySeries,
  type StageKey,
  type TimePoint,
  pearson,
  percentile,
} from "./telemetry";

// ---------------------------------------------------------------------------
// Deterministic mock telemetry derived from the cluster snapshot.
//
// Time-series end at BASE_NOW and are seeded per pod, so SSR === CSR. Replace
// getLatency()/getDrops() with real fetches (eBPF agent → Prometheus / Hubble)
// returning the same shapes; the UI is unchanged.
// ---------------------------------------------------------------------------

const STEP = 60; // 1 sample / minute
const T0 = BASE_NOW - WINDOW_MINUTES * STEP;
const TIMES: number[] = Array.from({ length: WINDOW_MINUTES + 1 }, (_, i) => T0 + i * STEP);

// per-stage baseline latency (ms) ranges for a "normal" pod
const STAGE_BASE: Record<StageKey, [number, number]> = {
  nic_rx: [0.02, 0.08],
  netstack: [0.12, 0.55],
  sockq: [0.05, 0.45],
  app: [0.6, 3.8],
  qdisc_tx: [0.05, 0.4],
  nic_tx: [0.02, 0.08],
};

let latencyCache: LatencyData | null = null;

export function getLatency(): LatencyData {
  if (latencyCache) return latencyCache;
  const cluster = getCluster();
  const pods = cluster.pods.filter((p) => p.phase === "Running");

  const stageSums: Record<StageKey, number[]> = {
    nic_rx: new Array(TIMES.length).fill(0),
    netstack: new Array(TIMES.length).fill(0),
    sockq: new Array(TIMES.length).fill(0),
    app: new Array(TIMES.length).fill(0),
    qdisc_tx: new Array(TIMES.length).fill(0),
    nic_tx: new Array(TIMES.length).fill(0),
  };

  const podSeries: PodLatencySeries[] = [];
  const histogramSamples: number[] = [];

  for (const pod of pods) {
    const r = seeded(hashString(pod.uid));
    const hot = r.chance(0.18);
    const kernelHot = hot && r.chance(0.5); // bottleneck inside the kernel net stack

    // per-pod baselines
    const base: Record<StageKey, number> = {} as Record<StageKey, number>;
    for (const s of LATENCY_STAGES) {
      const [lo, hi] = STAGE_BASE[s.key];
      let b = r.float(lo, hi);
      if (kernelHot && (s.key === "netstack" || s.key === "sockq")) b *= r.float(3.5, 6);
      if (hot && !kernelHot && s.key === "app") b *= r.float(2.5, 4.5);
      base[s.key] = b;
    }

    const phase = r.float(0, Math.PI * 2);
    const points = [];
    let lastStages: Record<StageKey, number> = {} as Record<StageKey, number>;

    for (let i = 0; i < TIMES.length; i++) {
      const wave = 1 + 0.12 * Math.sin(i / 4 + phase);
      const spike = r.chance(0.04) ? r.float(1.8, 3.2) : 1;
      let total = 0;
      const stagesAtI: Record<StageKey, number> = {} as Record<StageKey, number>;
      for (const s of LATENCY_STAGES) {
        const noise = 1 + r.float(-0.18, 0.18);
        const v = base[s.key] * wave * noise * spike;
        stagesAtI[s.key] = v;
        stageSums[s.key][i] += v;
        total += v;
      }
      points.push({ t: TIMES[i], v: total });
      histogramSamples.push(total);
      if (i === TIMES.length - 1) lastStages = stagesAtI;
    }

    const totals = points.map((p) => p.v);
    podSeries.push({
      uid: pod.uid,
      pod: pod.name,
      node: pod.nodeName,
      namespace: pod.namespace,
      points,
      stages: lastStages,
      p50: percentile(totals, 0.5),
      p95: percentile(totals, 0.95),
      p99: percentile(totals, 0.99),
    });
  }

  const podCount = Math.max(1, pods.length);
  const stageSeries: LatencyStagePoint[] = TIMES.map((t, i) => {
    const stages = {} as Record<StageKey, number>;
    let total = 0;
    for (const s of LATENCY_STAGES) {
      const avg = stageSums[s.key][i] / podCount;
      stages[s.key] = avg;
      total += avg;
    }
    return { t, stages, total };
  });

  const percentiles = TIMES.map((t, i) => {
    const totalsAtI = podSeries.map((ps) => ps.points[i].v);
    return {
      t,
      p50: percentile(totalsAtI, 0.5),
      p95: percentile(totalsAtI, 0.95),
      p99: percentile(totalsAtI, 0.99),
    };
  });

  latencyCache = { stageSeries, percentiles, pods: podSeries, histogramSamples };
  return latencyCache;
}

// --- drops -----------------------------------------------------------------

const HEAVY_REASONS = [
  "SKB_DROP_REASON_QDISC_DROP",
  "SKB_DROP_REASON_CPU_BACKLOG",
  "SKB_DROP_REASON_SOCKET_RCVBUFF",
  "SKB_DROP_REASON_QDISC_DROP",
];
const LIGHT_REASONS = [
  "SKB_DROP_REASON_NO_SOCKET",
  "SKB_DROP_REASON_NETFILTER_DROP",
  "SKB_DROP_REASON_TCP_OLD_DATA",
  "SKB_DROP_REASON_TCP_CSUM",
];

let dropsCache: DropData | null = null;

export function getDrops(): DropData {
  if (dropsCache) return dropsCache;
  const cluster = getCluster();
  const pods = cluster.pods.filter((p) => p.phase === "Running");
  const events: DropEvent[] = [];

  for (const pod of pods) {
    const r = seeded(hashString(pod.uid) ^ 0x9e3779b9);
    if (!r.chance(0.35)) continue; // only some pods drop
    const heavy = r.chance(0.25);
    const reasons = heavy ? HEAVY_REASONS : LIGHT_REASONS;
    const n = r.int(heavy ? 8 : 1, heavy ? 22 : 6);
    for (let k = 0; k < n; k++) {
      const t = r.pick(TIMES);
      const reason = r.pick(reasons);
      events.push({
        id: `${pod.uid}-${k}`,
        t,
        node: pod.nodeName,
        uid: pod.uid,
        pod: pod.name,
        namespace: pod.namespace,
        reason,
        srcIP: pod.podIP,
        dstIP: `10.96.${r.int(0, 10)}.${r.int(1, 254)}`,
        count: r.int(1, heavy ? 40 : 8),
      });
    }
  }

  // ensure every reason appears at least once for a complete legend/table
  void DROP_REASONS;

  events.sort((a, b) => b.t - a.t || b.count - a.count);
  dropsCache = { events, buckets: TIMES };
  return dropsCache;
}

// --- interference (features 3 · 4 · 5) -------------------------------------

const CONTRIB_BASE: Record<ContribKey, [number, number]> = {
  cpu: [2, 10],
  mem: [2, 9],
  net: [1, 8],
  pcie: [0, 3],
};

let interferenceCache: InterferenceData | null = null;

export function getInterference(): InterferenceData {
  if (interferenceCache) return interferenceCache;
  const cluster = getCluster();
  const pods = cluster.pods.filter((p) => p.phase === "Running");

  const scored: InterferenceScore[] = pods.map((pod) => {
    const r = seeded(hashString(pod.uid) ^ 0x51ed5a1d);
    const noisy = r.chance(0.22); // noisy-neighbor
    const pcieHeavy = r.chance(0.3); // I/O-bound (PCIe contention)
    const phase = r.float(0, Math.PI * 2);

    const base: Record<ContribKey, number> = {
      cpu: r.float(...CONTRIB_BASE.cpu) * (noisy ? r.float(2, 3) : 1),
      mem: r.float(...CONTRIB_BASE.mem) * (noisy ? r.float(1.8, 2.6) : 1),
      net: r.float(...CONTRIB_BASE.net) * (noisy ? r.float(2.2, 3.2) : 1),
      pcie: pcieHeavy ? r.float(6, 18) : r.float(...CONTRIB_BASE.pcie),
    };

    const series = [];
    const contribSum: Record<ContribKey, number> = { cpu: 0, mem: 0, net: 0, pcie: 0 };
    for (let i = 0; i < TIMES.length; i++) {
      const wave = 1 + 0.18 * Math.sin(i / 4 + phase);
      const spike = r.chance(0.05) ? r.float(1.5, 2.4) : 1;
      let total = 0;
      for (const k of ["cpu", "mem", "net", "pcie"] as ContribKey[]) {
        const noise = 1 + r.float(-0.15, 0.15);
        const v = Math.max(0, base[k] * wave * noise * spike);
        contribSum[k] += v;
        total += v;
      }
      series.push({ t: TIMES[i], v: Math.min(100, total) });
    }

    const n = TIMES.length;
    const contrib: Record<ContribKey, number> = {
      cpu: contribSum.cpu / n,
      mem: contribSum.mem / n,
      net: contribSum.net / n,
      pcie: contribSum.pcie / n,
    };
    const score = Math.min(100, series.reduce((s, p) => s + p.v, 0) / n);

    return {
      uid: pod.uid,
      pod: pod.name,
      node: pod.nodeName,
      namespace: pod.namespace,
      score,
      contrib,
      series,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // correlation matrix over the top entities (Pearson of interference series)
  const entities = scored.slice(0, 14);
  const r: number[][] = entities.map((a) =>
    entities.map((b) => (a.uid === b.uid ? 1 : pearson(a.series.map((p) => p.v), b.series.map((p) => p.v)))),
  );
  const correlation: CorrelationMatrix = {
    entities: entities.map((e) => ({ uid: e.uid, label: e.pod })),
    r,
  };

  // impact edges: a higher-scoring pod that co-varies with a lower one is the
  // likely cause of the lower one's contention.
  const impact: ImpactEdge[] = [];
  for (let i = 0; i < entities.length; i++) {
    for (let j = 0; j < entities.length; j++) {
      if (i === j) continue;
      const a = entities[i];
      const b = entities[j];
      if (a.score > b.score && r[i][j] > 0.45) {
        impact.push({ from: a.uid, to: b.uid, weight: r[i][j] });
      }
    }
  }

  interferenceCache = { pods: scored, correlation, impact };
  return interferenceCache;
}

// --- GPU (feature 6) -------------------------------------------------------

type GpuProfile = "busy" | "pcie_bound" | "net_bound" | "mixed";

const GPU_SPECS = [
  { node: "worker-1.k8s.local", index: 0, profile: "busy" as GpuProfile },
  { node: "worker-1.k8s.local", index: 1, profile: "pcie_bound" as GpuProfile },
  { node: "worker-2.k8s.local", index: 0, profile: "net_bound" as GpuProfile },
  { node: "worker-2.k8s.local", index: 1, profile: "mixed" as GpuProfile },
];

const MODEL = "NVIDIA A100-SXM4-40GB";
const MEM_TOTAL = 40960; // Mi
const POWER_LIMIT = 400; // W

let gpuCache: GpuData | null = null;

export function getGpu(): GpuData {
  if (gpuCache) return gpuCache;

  const devices: GpuDevice[] = GPU_SPECS.map((spec, gi) => {
    const r = seeded(hashString(`${spec.node}#${spec.index}`) ^ 0x6c0ffee5);
    const phase = r.float(0, Math.PI * 2);

    // baseline utilization band by profile
    const utilBand: Record<GpuProfile, [number, number]> = {
      busy: [72, 94],
      pcie_bound: [22, 46],
      net_bound: [26, 52],
      mixed: [48, 72],
    };
    const [ulo, uhi] = utilBand[spec.profile];

    const util: TimePoint[] = [];
    const mem: TimePoint[] = [];
    const temp: TimePoint[] = [];
    const power: TimePoint[] = [];
    const pcie: TimePoint[] = [];
    const tcpRetrans: TimePoint[] = [];
    const breakdown: GpuBreakdownPoint[] = [];

    const memFrac = r.float(0.45, 0.9);

    for (let i = 0; i < TIMES.length; i++) {
      const t = TIMES[i];
      const wave = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(i / 5 + phase));
      const u = Math.max(2, Math.min(99, ulo + (uhi - ulo) * wave + r.float(-6, 6)));
      util.push({ t, v: u });

      const rem = 100 - u;
      // attribute the idle remainder to a cause based on profile
      let pcieWait = 0;
      let netWait = 0;
      if (spec.profile === "pcie_bound") {
        pcieWait = rem * r.float(0.62, 0.82);
        netWait = rem * r.float(0.04, 0.12);
      } else if (spec.profile === "net_bound") {
        netWait = rem * r.float(0.6, 0.8);
        pcieWait = rem * r.float(0.05, 0.14);
      } else if (spec.profile === "mixed") {
        pcieWait = rem * r.float(0.3, 0.45);
        netWait = rem * r.float(0.3, 0.45);
      } else {
        pcieWait = rem * r.float(0.1, 0.25);
        netWait = rem * r.float(0.1, 0.25);
      }
      const idle = Math.max(0, rem - pcieWait - netWait);
      breakdown.push({ t, stages: { busy: u, pcieWait, netWait, idle } as Record<GpuStateKey, number> });

      // PCIe occupancy tracks pcieWait (cause of PCIe-bound idle)
      const pcieOcc =
        spec.profile === "pcie_bound"
          ? Math.min(98, 60 + pcieWait * 0.9 + r.float(-5, 8))
          : Math.min(70, 12 + pcieWait * 1.2 + r.float(-4, 6));
      pcie.push({ t, v: Math.max(2, pcieOcc) });

      // TCP retransmits track netWait (cause of network-bound idle)
      const retr =
        spec.profile === "net_bound"
          ? Math.max(0, 45 + netWait * 4 + r.float(-15, 20))
          : Math.max(0, netWait * 1.5 + r.float(0, 8));
      tcpRetrans.push({ t, v: retr });

      mem.push({ t, v: Math.min(MEM_TOTAL, MEM_TOTAL * memFrac + r.float(-1200, 1200)) });
      temp.push({ t, v: Math.round(38 + (u / 100) * 42 + r.float(-2, 2)) });
      power.push({ t, v: Math.min(POWER_LIMIT, 60 + (u / 100) * (POWER_LIMIT - 70) + r.float(-12, 12)) });
    }

    const hex = (len: number) => {
      const chars = "abcdef0123456789";
      let s = "";
      for (let i = 0; i < len; i++) s += chars[r.int(0, chars.length - 1)];
      return s;
    };

    return {
      id: `gpu-${gi}`,
      node: spec.node,
      index: spec.index,
      model: MODEL,
      uuid: `GPU-${hex(8)}-${hex(4)}`,
      memTotalMi: MEM_TOTAL,
      powerLimitW: POWER_LIMIT,
      util,
      mem,
      temp,
      power,
      pcie,
      tcpRetrans,
      breakdown,
    };
  });

  gpuCache = { devices };
  return gpuCache;
}
