"use client";

// ───────────────────────────────────────────────────────────────────────────
// 노드 상세 — 실 API (react-query, 30s 갱신 · vitals 1s 폴링)
//   UI 는 기존 패널/레이아웃 그대로, 데이터만 node-view 어댑터로 변환해 주입한다.
//   미지원 신호는 각 컴포넌트의 empty state 로 남긴다.
// ───────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { use } from "react";

import { isNotFoundError } from "../../lib/api/client";
import {
  toCpuPressureItems,
  toDiagnosisPlaceholder,
  toDropAgg,
  toDropReasonRows,
  toGpuInfo,
  toNetFlow,
  toNetobsAgent,
  toNodeAlerts,
  toNodeDiagnosis,
  toNodeDisplayStatus,
  toNodeHealth,
  toNoisyRows,
  toPodResourceRows,
  toRetransRows,
  toServiceTopology,
  toStageLatency,
  nicLinkOf,
  podForWorkload,
} from "../../lib/api/node-view";
import {
  gpuStatusQueryOptions,
  nodeVitalsQueryOptions,
  useAgentsQuery,
  useBandwidthQuery,
  useDropsQuery,
  useIncidentsQuery,
  useLatencyBreakdownQuery,
  useNodeDetailQuery,
  useNodeMapQuery,
  useNodePodsQuery,
  useNoisyNeighborQuery,
  usePressureQuery,
} from "../../lib/api/queries";
import {
  AlertList,
  DiagnosisCard,
  DropReasonsTable,
  GpuAgentPanel,
  GpuCardGrid,
  GpuPodsByDevice,
  HealthScores,
  NetFlowPanel,
  NetobsDashboard,
  NodeGpuEventsTimeline,
  NoisyPanel,
  PodResourceTable,
  ScoreBars,
  StageLatency,
} from "../../lib/charts";
import { C_CALM, C_CRIT, C_NODATA, C_WARN, DISPLAY_STATUS_TONE } from "../../lib/cluster";
import { NodeMapHoneycomb } from "../../lib/honeycomb";
import { LiveArea, LiveVitals, type VitalTile } from "../../lib/live";
import { ServiceTopology } from "../../lib/service-topology";
import { AppShell, EntityHeader, SectionTitle } from "../../lib/shell";
import { type TabDef, Tabs } from "../../lib/tabs";
import { Card, EmptyState, LegendHex } from "../../lib/ui";

export default function NodePage({ params }: { params: Promise<{ node: string }> }) {
  const nodeName = decodeURIComponent(use(params).node);

  const mapQuery = useNodeMapQuery({ node: nodeName });
  const detailQuery = useNodeDetailQuery(nodeName);
  // vitals 만 1s 폴링 — 게이지·스트리밍 차트가 실측값을 그대로 흘린다 (synthetic=false)
  const vitalsQuery = useQuery({ ...nodeVitalsQueryOptions({ node: nodeName }), refetchInterval: 1000, staleTime: 0 });
  const podsQuery = useNodePodsQuery(nodeName);
  const incidentsQuery = useIncidentsQuery({ node: nodeName });
  const cpuPressureQuery = usePressureQuery({ dimension: "cpu", scope: "pod", node: nodeName, limit: 12 });
  const dropsQuery = useDropsQuery({ node: nodeName, limit: 50 });
  const egressQuery = useLatencyBreakdownQuery({ scope: "node", direction: "egress", node: nodeName });
  const ingressQuery = useLatencyBreakdownQuery({ scope: "node", direction: "ingress", node: nodeName });
  const bandwidthQuery = useBandwidthQuery({ node: nodeName, limit: 100 });
  const noisyQuery = useNoisyNeighborQuery({ limit: 500 });
  const agentsQuery = useAgentsQuery({ node: nodeName });

  const mapNode = mapQuery.data?.nodes.find((n) => n.name === nodeName);
  const isGpu = !!mapNode?.gpu;
  const gpuStatusQuery = useQuery({ ...gpuStatusQueryOptions({ node: nodeName }), enabled: isGpu });

  if (mapQuery.isError && isNotFoundError(mapQuery.error)) notFound();
  if (mapQuery.isPending) return <PageLoading crumb={nodeName} message="노드 정보를 불러오는 중…" />;
  if (!mapNode) {
    return (
      <PageLoading
        crumb={nodeName}
        message={mapQuery.error instanceof Error ? `노드 정보를 불러오지 못했습니다 — ${mapQuery.error.message}` : "노드 정보를 불러오지 못했습니다."}
        error
      />
    );
  }

  const node = mapNode;
  const podNames = node.pods.map((p) => p.pod);
  const podSet = new Set(podNames);
  const display = toNodeDisplayStatus(detailQuery.data, node);
  const tone = DISPLAY_STATUS_TONE[display];
  const incidents = incidentsQuery.data?.incidents ?? [];
  const diagnosis = detailQuery.data ? toNodeDiagnosis(detailQuery.data, incidents, display) : toDiagnosisPlaceholder(node.name, detailQuery.isError);
  const health = detailQuery.data ? toNodeHealth(detailQuery.data, isGpu) : null;
  const alerts = toNodeAlerts(incidents, podSet);
  const noisy = toNoisyRows(noisyQuery.data?.items, podSet);
  const serviceTopo = toServiceTopology(node, bandwidthQuery.data, noisy);
  const podRows = toPodResourceRows(podsQuery.data?.pods ?? []);
  const liveCount = node.pods.filter((p) => !p.no_data).length;

  const throttleItems = toCpuPressureItems(cpuPressureQuery.data);
  const dropAgg = toDropAgg(dropsQuery.data);

  const podHref = (podName: string) => `/clusters/${node.name}/${podName}`;
  const workloadHref = (label: string) => {
    const pod = podForWorkload(label, podNames);
    return pod ? podHref(pod) : `/clusters/${node.name}`;
  };
  const dim = diagnosis.dimension;
  const gpu = isGpu ? toGpuInfo(gpuStatusQuery.data, agentsQuery.data?.agents.find((a) => a.agent === "gpuobs"), nicLinkOf(bandwidthQuery.data, node.name)) : null;

  // ── 노드 vitals (실측 /node-vitals) — Grafana Node Exporter 관례:
  //    포화도(%)는 임계 색 게이지, 용량·카운트는 stat 타일. GPU 노드는 GPU util/mem
  //    게이지를, 비-GPU 노드는 Pods/Live stat 타일을 덧붙인다.
  const v = vitalsQuery.data;
  const cpuPct = Math.round(v?.cpu_percent ?? 0);
  const memPct = Math.round(v?.memory_percent ?? 0);
  const gpuUsagePct = Math.round(v?.gpu_percent ?? 0);
  const gpuMemUsedGB = (v?.gpu_memory_used_bytes ?? 0) / 1024 ** 3;
  const gpuMemTotalGB = (v?.gpu_memory_total_bytes ?? 0) / 1024 ** 3;
  const gpuMemPct = Math.round(v?.gpu_memory_percent ?? 0);
  const gpuCount = mapNode.gpu_devices || gpu?.views.length || 0;
  const vitalTiles: VitalTile[] = [
    { kind: "gauge", label: "CPU", pct: cpuPct, sub: "limit 대비 파드 평균" },
    { kind: "gauge", label: "Memory", pct: memPct, sub: "limit 대비 파드 평균" },
    ...(isGpu
      ? ([
          {
            kind: "gauge",
            label: "GPU 사용률",
            pct: gpuUsagePct,
            sub: `SM util · ${gpuCount} GPU 평균`,
          },
          {
            kind: "gauge",
            label: "GPU 메모리",
            pct: gpuMemPct,
            sub: `${gpuMemUsedGB.toFixed(0)} / ${gpuMemTotalGB.toFixed(0)} GB`,
          },
        ] as VitalTile[])
      : ([
          {
            kind: "stat",
            label: "Pods",
            value: `${node.pods.length}`,
            sub: "전체",
          },
          {
            kind: "stat",
            label: "Live",
            value: `${liveCount}`,
            sub: "텔레메트리 수신",
          },
        ] as VitalTile[])),
  ];
  // 실시간 스트리밍 시계열(노드) — 평균 CPU/Mem(+GPU) 사용률을 우→좌로 흘려보낸다.
  const liveSeries = [
    {
      key: "cpu",
      label: "CPU",
      color: "#6366f1",
      base: cpuPct,
      unit: "%",
      vol: 5,
    },
    {
      key: "mem",
      label: "Memory",
      color: "#0ea5e9",
      base: memPct,
      unit: "%",
      vol: 4,
    },
    ...(isGpu
      ? [
          {
            key: "gpu",
            label: "GPU",
            color: "#8b5cf6",
            base: gpuUsagePct,
            unit: "%",
            vol: 6,
          },
        ]
      : []),
  ];

  // 네트워크 (송/수신 경로 · ip_version flow · 워크로드별 재전송 · drop reason)
  const stageLat = toStageLatency(egressQuery.data, ingressQuery.data);
  const netFlow = toNetFlow(dropsQuery.data);
  const retransRows = toRetransRows(dropsQuery.data);
  const dropRows = toDropReasonRows(dropsQuery.data);
  // netobs-agent self-health (네트워크 eBPF agent)
  const netobs = toNetobsAgent(agentsQuery.data?.agents.find((a) => a.agent === "netobs"));

  // CPU + 네트워크 상세를 한 곳에 모은 패널 (GPU 제외 — GPU는 GPUs/GPU Detail에서).
  // 넓은 캔버스를 채우도록 2-col 그리드, 폭이 큰 카드(경로 지연·드롭 테이블)는 span-2.
  const resourcesContent = (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card
        className="lg:col-span-2"
        title="CPU throttle score (Pod별)"
        hint="파드별 CPU 압박(pressure) 점수 — 0 = 압박 없음, 1 = limit 에 상시 걸림. 색이 붉고 배지가 달린 파드가 백엔드가 elevated/high 로 판정한 파드입니다."
      >
        <ScoreBars items={throttleItems} kind="score" href={podHref} />
      </Card>
      <Card className="lg:col-span-2">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-bold text-slate-700">
                Send path p99
              </h3>
              <span className="text-[11px] text-slate-500">
                병목{" "}
                <span className="font-mono font-semibold text-rose-600">
                  {stageLat.txBottleneck}
                </span>
              </span>
            </div>
            {stageLat.tx.length ? (
              <StageLatency stages={stageLat.tx} bottleneck={stageLat.txBottleneck} />
            ) : (
              <EmptyState message="데이터 없음" />
            )}
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-bold text-slate-700">
                Receive path p99
              </h3>
              <span className="text-[11px] text-slate-500">
                병목{" "}
                <span className="font-mono font-semibold text-rose-600">
                  {stageLat.rxBottleneck}
                </span>
              </span>
            </div>
            {stageLat.rx.length ? (
              <StageLatency stages={stageLat.rx} bottleneck={stageLat.rxBottleneck} />
            ) : (
              <EmptyState message="데이터 없음" />
            )}
          </div>
        </div>
      </Card>
      <Card title="Drop rate by category (events/s)">
        <ScoreBars items={dropAgg} kind="rate" unit="/s" />
      </Card>
      <Card title="Network flow / drop by ip_version">
        <NetFlowPanel flow={netFlow} />
      </Card>
      <Card title="TCP retransmission rate by workload (events/s)">
        <ScoreBars
          items={retransRows.map((r) => ({ label: r.workload, value: r.rate }))}
          kind="rate"
          unit="/s"
          href={workloadHref}
        />
      </Card>
      <Card
        className="lg:col-span-2"
        title="Top drop reasons by workload (5m rate)"
      >
        <DropReasonsTable rows={dropRows} />
      </Card>
    </div>
  );

  let tabs: TabDef[];
  let initialTab: string;

  // 서비스 토폴로지 탭 — 노드의 파드/서비스 관계 그래프 + noisy-neighbor 상세 (GPU·비-GPU 공용).
  // eBPF(Hubble/Kiali) 관례의 "topology" = 서비스 관계 그래프. down 노드(전부 nodata)면 생략.
  const topologyTab: TabDef | null = serviceTopo
    ? {
        id: "topology",
        label: "Services",
        badge: serviceTopo.linkCount || undefined,
        content: (
          <div className="space-y-4">
            <Card
              title="서비스 토폴로지 (netobs)"
              hint="이 노드의 서비스 관계 맵 (레플리카 집계) — 노드=서비스, 크기=파드수·트래픽, 색=상태, 화살표=noisy-neighbor 간섭. 클릭 → 대표 파드."
            >
              <ServiceTopology topo={serviceTopo} node={node.name} />
            </Card>
            {noisy.length > 0 ? (
              <Card title="Noisy neighbor — victim_signal 별 (suspect → victim)">
                <NoisyPanel rows={noisy} />
              </Card>
            ) : null}
          </div>
        ),
      }
    : null;

  const podsTabBody = (
    <>
      <Card>
        <div className="mb-3 flex items-center justify-end gap-3 text-[11px] text-slate-500">
          <LegendHex color={C_CALM} label="정상" />
          <LegendHex color={C_WARN} label="Warn" />
          <LegendHex color={C_CRIT} label="Crit" />
          <LegendHex color={C_NODATA} label="N/A" />
        </div>
        <NodeMapHoneycomb node={node} />
      </Card>
      <Card
        title="파드 자원 (Pod별)"
        hint="CPU·메모리는 limit 대비 % (limit 없는 파드는 cores·working set 원값), 네트워크는 바이트율. 이상 파드 우선 정렬. 행 클릭 → 파드 상세."
      >
        <PodResourceTable rows={podRows} href={podHref} />
      </Card>
    </>
  );

  if (gpu) {
    // ── GPU 노드 = "GPU rack" 관점 탭: GPUs · Pods · Resources · Topology · Events ──
    tabs = [
      {
        id: "gpus",
        label: "GPUs",
        badge: gpu.views.length || undefined,
        alert: dim === "gpu",
        content: (
          <Card
            title="GPU 디바이스 (gpuobs)"
            hint="디바이스 헬스 — 클릭 → GPU Detail. NVLink 패브릭/topo -m 은 미수집"
          >
            <GpuCardGrid views={gpu.views} node={node.name} />
          </Card>
        ),
      },
      {
        id: "pods",
        label: "Pods",
        badge: node.pods.length,
        content: (
          <div className="space-y-4">
            {podsTabBody}
            <Card
              title="GPU별 사용 파드"
              hint="이 노드의 GPU들에 어떤 파드가 올라가 있나 — 디바이스별 귀속"
            >
              <GpuPodsByDevice gpu={gpu} node={node.name} />
            </Card>
          </div>
        ),
      },
      {
        id: "resources",
        label: "Resources",
        alert: dim === "cpu" || dim === "net" || dim === "latency",
        content: resourcesContent,
      },
      {
        id: "events",
        label: "Events",
        badge: alerts.length || undefined,
        content: (
          <div className="space-y-4">
            {alerts.length > 0 ? (
              <Card title={`Active alerts (${alerts.length})`}>
                <AlertList node={node.name} alerts={alerts} />
              </Card>
            ) : null}
            <Card
              title="GPU 이벤트 (디바이스 롤업)"
              hint="XID·ECC·throttle 등 DCGM/NVML 디바이스 이벤트를 시간순으로"
            >
              <NodeGpuEventsTimeline views={gpu.views} />
            </Card>
            <Card
              title="gpuobs-agent self-health"
              hint="관측 신뢰도 — GPU 진단의 전제"
            >
              <GpuAgentPanel agent={gpu.agent} />
            </Card>
            <Card title="netobs-agent self-health">
              <NetobsDashboard agent={netobs} />
            </Card>
          </div>
        ),
      },
    ];

    if (topologyTab) {
      const at = tabs.findIndex((t) => t.id === "pods");
      tabs.splice(at + 1, 0, topologyTab);
    }

    initialTab = display === "down" ? "events" : "gpus";
  } else {
    // ── 비-GPU 노드 — 기존 eBPF 상세 구조 유지 ──
    tabs = [
      {
        id: "pods",
        label: "파드",
        badge: node.pods.length,
        content: <div className="space-y-4">{podsTabBody}</div>,
      },
      {
        id: "cpu",
        label: "CPU",
        alert: dim === "cpu",
        content: (
          <Card
            title="CPU throttle score (Pod별)"
            hint="파드별 CPU 압박(pressure) 점수 — 0 = 압박 없음, 1 = limit 에 상시 걸림. 색이 붉고 배지가 달린 파드가 백엔드가 elevated/high 로 판정한 파드입니다."
          >
            <ScoreBars items={throttleItems} kind="score" href={podHref} />
          </Card>
        ),
      },
      {
        id: "net",
        label: "네트워크",
        alert: dim === "net" || dim === "latency",
        content: resourcesContent,
      },
      {
        id: "agent",
        label: "에이전트",
        alert: !netobs.up,
        badge: netobs.failedCount || undefined,
        content: (
          <Card title="netobs-agent self-health">
            <NetobsDashboard agent={netobs} />
          </Card>
        ),
      },
      {
        id: "alerts",
        label: "알림",
        badge: alerts.length || undefined,
        content: (
          <Card title={`Active alerts (${alerts.length})`}>
            <AlertList node={node.name} alerts={alerts} />
          </Card>
        ),
      },
    ];

    if (topologyTab) {
      const at = tabs.findIndex((t) => t.id === "pods");
      tabs.splice(at + 1, 0, topologyTab);
    }

    initialTab =
      dim === "cpu"
        ? "cpu"
        : dim === "net" || dim === "latency"
          ? "net"
          : display === "down"
            ? "alerts"
            : "pods";
  }

  const role = node.roles?.includes("control-plane") ? "control-plane" : "worker";

  return (
    <AppShell
      crumbs={[
        { label: "Anomaly Map", href: "/" },
        { label: node.name, dot: tone.dot },
      ]}
    >
      <div className="space-y-6">
        <EntityHeader
          kind={isGpu ? "GPU 노드" : "노드"}
          title={node.name}
          statusDot={tone.dot}
          statusLabel={tone.label}
          pills={
            <>
              <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {role}
              </span>
              {isGpu ? (
                <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                  GPU ×{gpuCount}
                </span>
              ) : null}
            </>
          }
          facts={[
            { label: "Pods", value: node.pods.length },
            { label: "Live", value: liveCount },
            ...(isGpu
              ? [
                  {
                    label: "GPU 메모리",
                    value: `${gpuMemUsedGB.toFixed(0)}/${gpuMemTotalGB.toFixed(0)} GB`,
                    tone: "text-violet-700",
                  },
                ]
              : []),
          ]}
        />

        {/* ── 답(verdict) + Vitals 요약 행 — Datadog 서비스 헤더 관례(좌 결론·우 KPI) ── */}
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DiagnosisCard node={node.name} dx={diagnosis} />
          </div>
          <section className="lg:col-span-1">
            <SectionTitle
              right={
                <span className="text-[11px] text-slate-500">live · 1s</span>
              }
            >
              Vitals
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              {v ? <LiveVitals tiles={vitalTiles} synthetic={false} /> : null}
            </div>
          </section>
        </div>

        {/* ── 실시간 사용률 — 스트리밍 시계열 (/node-vitals 1s 폴링) ── */}
        <section>
          <SectionTitle
            right={
              <span className="text-[11px] text-slate-500">streaming · 1s</span>
            }
          >
            실시간 사용률
          </SectionTitle>
          <Card>
            {v ? (
              <LiveArea series={liveSeries} max={100} caption="live · 1s" synthetic={false} />
            ) : (
              <EmptyState message={vitalsQuery.isError ? "데이터 없음" : "불러오는 중…"} />
            )}
          </Card>
        </section>

        {/* ── Health: 차원별 합성 건강도(0–1) ── */}
        <section>
          <SectionTitle>Health</SectionTitle>
          {health ? <HealthScores scores={health} /> : <EmptyState message={detailQuery.isError ? "데이터 없음" : "불러오는 중…"} />}
        </section>

        {/* ── 상세 (탭으로 분류) ── */}
        <section>
          <SectionTitle>상세 분석</SectionTitle>
          <Tabs tabs={tabs} initial={initialTab} />
        </section>
      </div>
    </AppShell>
  );
}

function PageLoading({ crumb, message, error }: { crumb: string; message: string; error?: boolean }) {
  return (
    <AppShell crumbs={[{ label: "Anomaly Map", href: "/" }, { label: crumb }]}>
      <div className="mt-16 flex flex-col items-center gap-2 text-slate-400">
        {error ? null : <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />}
        <span className={`text-[13px] ${error ? "font-semibold text-slate-600" : ""}`}>{message}</span>
      </div>
    </AppShell>
  );
}
