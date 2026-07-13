import { notFound } from "next/navigation";

import {
  C_CALM,
  C_CRIT,
  C_NODATA,
  C_WARN,
  DISPLAY_STATUS_TONE,
  getNode,
  gpuFabric,
  netobsAgentHealth,
  nodeAlerts,
  nodeDiagnosis,
  nodeDropReasons,
  nodeGpu,
  nodeHealth,
  nodeNetFlow,
  nodeNoisyNeighbors,
  nodeRetransByWorkload,
  nodeServiceTopology,
  nodeDisplayStatus,
  nodeStageLatency,
  podAnalytics,
  podAnomaly,
} from "../../lib/cluster";
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
import { GpuViews } from "../../lib/gpu-topology";
import { PodHoneycomb } from "../../lib/honeycomb";
import { LiveArea, LiveVitals, type VitalTile } from "../../lib/live";
import { ServiceTopology } from "../../lib/service-topology";
import { AppShell, EntityHeader, SectionTitle } from "../../lib/shell";
import { type TabDef, Tabs } from "../../lib/tabs";
import { Card, LegendHex } from "../../lib/ui";

export default async function NodePage({
  params,
}: {
  params: Promise<{ node: string }>;
}) {
  const { node: nodeName } = await params;
  const node = getNode(decodeURIComponent(nodeName));
  if (!node) notFound();

  const diagnosis = nodeDiagnosis(node);
  const health = nodeHealth(node);
  const alerts = nodeAlerts(node);
  const noisy = nodeNoisyNeighbors(node);
  const serviceTopo = nodeServiceTopology(node);

  const live = node.pods.filter((p) => p.cpu >= 0);
  const analytics = live.map((p) => ({ pod: p, a: podAnalytics(node, p) }));
  // throttle 막대 — cpu 이상이 잡힌 파드는 severity 배지 + 원인 신호를 막대에 인라인 표시
  const throttleItems = [...analytics]
    .sort((x, y) => y.a.throttle - x.a.throttle)
    .slice(0, 12)
    .map((x) => {
      const an = podAnomaly(node, x.pod);
      const cpuAn = an?.kind === "cpu" ? an : null;
      return {
        label: x.pod.name,
        value: x.a.throttle,
        severity: cpuAn?.sev,
        note: cpuAn?.ebpf.join(" · "),
      };
    });
  const dropAgg = ["drop policy", "drop queue", "drop unknown", "retrans"].map(
    (cat) => ({
      label: cat,
      value: analytics.reduce(
        (s, x) => s + (x.a.drops.find((d) => d.category === cat)?.rate ?? 0),
        0,
      ),
    }),
  );

  const podHref = (podName: string) => `/clusters/${node.name}/${podName}`;
  const dim = diagnosis.dimension;
  const gpu = nodeGpu(node);
  const tone = DISPLAY_STATUS_TONE[nodeDisplayStatus(node)];

  // ── 노드 vitals (실시간 사용률) — 모든 노드 공통. Grafana Node Exporter 관례:
  //    포화도(%)는 임계 색 게이지, 용량·카운트는 stat 타일. GPU 노드는 GPU util/mem
  //    게이지를, 비-GPU 노드는 Pods/Live stat 타일을 덧붙인다.
  const cpuPct = live.length
    ? Math.round(live.reduce((s, p) => s + p.cpu, 0) / live.length)
    : 0;
  const memPct = live.length
    ? Math.round(live.reduce((s, p) => s + p.mem, 0) / live.length)
    : 0;
  const gpuUsagePct =
    gpu && gpu.views.length
      ? Math.round(
          (gpu.views.reduce((s, v) => s + v.device.util, 0) /
            gpu.views.length) *
            100,
        )
      : 0;
  const gpuMemUsedGB = gpu
    ? gpu.views.reduce((s, v) => s + v.device.memUsedMB, 0) / 1024
    : 0;
  const gpuMemTotalGB = gpu
    ? gpu.views.reduce((s, v) => s + v.device.memTotalMB, 0) / 1024
    : 0;
  const gpuMemPct =
    gpuMemTotalGB > 0 ? Math.round((gpuMemUsedGB / gpuMemTotalGB) * 100) : 0;
  const vitalTiles: VitalTile[] = [
    { kind: "gauge", label: "CPU", pct: cpuPct, sub: "live 파드 평균" },
    { kind: "gauge", label: "Memory", pct: memPct, sub: "live 파드 평균" },
    ...(gpu
      ? ([
          {
            kind: "gauge",
            label: "GPU 사용률",
            pct: gpuUsagePct,
            sub: `SM util · ${gpu.views.length} GPU 평균`,
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
            value: `${live.length}`,
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
    ...(gpu
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
  const stageLat = nodeStageLatency(node);
  const netFlow = nodeNetFlow(node);
  const retransRows = nodeRetransByWorkload(node);
  const dropRows = nodeDropReasons(node);
  // netobs-agent self-health (네트워크 eBPF agent)
  const netobs = netobsAgentHealth(node);

  // CPU + 네트워크 상세를 한 곳에 모은 패널 (GPU 제외 — GPU는 GPUs/GPU Detail에서).
  // 넓은 캔버스를 채우도록 2-col 그리드, 폭이 큰 카드(경로 지연·드롭 테이블)는 span-2.
  const resourcesContent = (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card
        className="lg:col-span-2"
        title="CPU throttle score (Pod별)"
        hint="CPU limit(cgroup quota)에 걸려 실행이 강제 대기(throttle)된 비율. 0 = throttle 없음, 1 = 거의 매 스케줄링 주기마다 대기. 색이 붉고 배지가 달린 파드가 실제 이상이며, 아래 ↳ 줄이 원인 신호입니다."
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
            <StageLatency
              stages={stageLat.tx}
              bottleneck={stageLat.txBottleneck}
            />
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
            <StageLatency
              stages={stageLat.rx}
              bottleneck={stageLat.rxBottleneck}
            />
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
          href={(label) => podHref(label.split("/")[1] ?? label)}
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

  if (gpu) {
    // ── GPU 노드 = "GPU rack" 관점 탭: GPUs · Pods · Resources · Topology · Events ──
    const fabric = gpuFabric(node, gpu);

    tabs = [
      {
        id: "gpus",
        label: "GPUs",
        badge: gpu.views.length || undefined,
        alert: dim === "gpu",
        content: (
          <Card
            title="GPU 디바이스 (gpuobs)"
            hint="Grid=디바이스 헬스 · Fabric=인터커넥트 · Matrix=topo -m. 클릭 → GPU Detail"
          >
            {fabric ? (
              <GpuViews
                grid={<GpuCardGrid views={gpu.views} node={node.name} />}
                fabric={fabric}
                node={node.name}
              />
            ) : (
              <GpuCardGrid views={gpu.views} node={node.name} />
            )}
          </Card>
        ),
      },
      {
        id: "pods",
        label: "Pods",
        badge: node.pods.length,
        content: (
          <div className="space-y-4">
            <Card>
              <div className="mb-3 flex items-center justify-end gap-3 text-[11px] text-slate-500">
                <LegendHex color={C_CALM} label="정상" />
                <LegendHex color={C_WARN} label="Warn" />
                <LegendHex color={C_CRIT} label="Crit" />
                <LegendHex color={C_NODATA} label="N/A" />
              </div>
              <PodHoneycomb node={node} />
            </Card>
            <Card
              title="파드 자원 (Pod별)"
              hint="CPU·메모리·네트워크 사용률과 상태 — 이상 파드 우선 정렬. 행 클릭 → 파드 상세."
            >
              <PodResourceTable node={node} href={podHref} />
            </Card>
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
        alert: dim === "cpu" || dim === "net",
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

    initialTab = node.status === "down" ? "events" : "gpus";
  } else {
    // ── 비-GPU 노드 — 기존 eBPF 상세 구조 유지 ──
    tabs = [
      {
        id: "pods",
        label: "파드",
        badge: node.pods.length,
        content: (
          <div className="space-y-4">
            <Card>
              <div className="mb-3 flex items-center justify-end gap-3 text-[11px] text-slate-500">
                <LegendHex color={C_CALM} label="정상" />
                <LegendHex color={C_WARN} label="Warn" />
                <LegendHex color={C_CRIT} label="Crit" />
                <LegendHex color={C_NODATA} label="N/A" />
              </div>
              <PodHoneycomb node={node} />
            </Card>
            <Card
              title="파드 자원 (Pod별)"
              hint="CPU·메모리·네트워크 사용률과 상태 — 이상 파드 우선 정렬. 행 클릭 → 파드 상세."
            >
              <PodResourceTable node={node} href={podHref} />
            </Card>
          </div>
        ),
      },
      {
        id: "cpu",
        label: "CPU",
        alert: dim === "cpu",
        content: (
          <Card
            title="CPU throttle score (Pod별)"
            hint="CPU limit(cgroup quota)에 걸려 실행이 강제 대기(throttle)된 비율. 0 = throttle 없음, 1 = 거의 매 스케줄링 주기마다 대기. 색이 붉고 배지가 달린 파드가 실제 이상이며, 아래 ↳ 줄이 원인 신호입니다."
          >
            <ScoreBars items={throttleItems} kind="score" href={podHref} />
          </Card>
        ),
      },
      {
        id: "net",
        label: "네트워크",
        alert: dim === "net",
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
      dim === "cpu" || dim === "net"
        ? dim
        : node.status === "down"
          ? "alerts"
          : "pods";
  }

  return (
    <AppShell
      crumbs={[
        { label: "Anomaly Map", href: "/" },
        { label: node.name, dot: tone.dot },
      ]}
    >
      <div className="space-y-6">
        <EntityHeader
          kind={gpu ? "GPU 노드" : "노드"}
          title={node.name}
          statusDot={tone.dot}
          statusLabel={tone.label}
          pills={
            <>
              <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {node.role}
              </span>
              {gpu ? (
                <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                  GPU ×{gpu.views.length}
                </span>
              ) : null}
            </>
          }
          facts={[
            { label: "Pods", value: node.pods.length },
            { label: "Live", value: live.length },
            ...(gpu
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
                <span className="text-[11px] text-slate-500">live · 15m</span>
              }
            >
              Vitals
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <LiveVitals tiles={vitalTiles} />
            </div>
          </section>
        </div>

        {/* ── 실시간 사용률 — 스트리밍 시계열(노드 페이지엔 없던 차트) ── */}
        <section>
          <SectionTitle
            right={
              <span className="text-[11px] text-slate-500">streaming · 1s</span>
            }
          >
            실시간 사용률
          </SectionTitle>
          <Card>
            <LiveArea series={liveSeries} max={100} caption="live · 1s" />
          </Card>
        </section>

        {/* ── Health: 차원별 합성 건강도(0–1) ── */}
        <section>
          <SectionTitle>Health</SectionTitle>
          <HealthScores scores={health} />
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
