"use client";

// ───────────────────────────────────────────────────────────────────────────
// 파드 상세 — 실 API (react-query, 30s 갱신)
//   신원/상태 = node-map 파드 엔트리 · 실측 = /pod/{ns}/{pod} · 그 외 패널은 pod-view 어댑터.
//   UI 는 기존 패널/레이아웃 그대로, 미지원 신호는 empty state("—"/데이터 없음).
// ───────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use } from "react";

import { isNotFoundError } from "../../../lib/api/client";
import { toNodeAlerts, toNodeDisplayStatus, toNoisyRows } from "../../../lib/api/node-view";
import {
  podBandwidth,
  podHasTelemetry,
  toPodDiagnosis,
  toPodDrops,
  toPodGpuUsage,
  toPodHealth,
  toPodStages,
} from "../../../lib/api/pod-view";
import {
  gpuStatusQueryOptions,
  useBandwidthQuery,
  useDropsQuery,
  useIncidentsQuery,
  useLatencyBreakdownQuery,
  useNodeDetailQuery,
  useNodeMapQuery,
  useNoisyNeighborQuery,
  usePodDetailQuery,
} from "../../../lib/api/queries";
import { NODATA_TONE, podDisplayStatusOf } from "../../../lib/api/status";
import {
  AlertList,
  DiagnosisCard,
  HealthScores,
  healthToneClass,
  NoisyPanel,
  PodGpuPanel,
  ScoreBars,
  StageLatency,
  StatChip,
} from "../../../lib/charts";
import { DISPLAY_STATUS_TONE } from "../../../lib/cluster";
import { LiveArea, LiveVitals, type StreamSeries, type VitalTile } from "../../../lib/live";
import { AppShell, EntityHeader, SectionTitle } from "../../../lib/shell";
import { type TabDef, Tabs } from "../../../lib/tabs";
import { Card, EmptyState, MetricBar } from "../../../lib/ui";

export default function PodPage({ params }: { params: Promise<{ node: string; pod: string }> }) {
  const p = use(params);
  const nodeName = decodeURIComponent(p.node);
  const podName = decodeURIComponent(p.pod);

  const mapQuery = useNodeMapQuery({ node: nodeName });
  const mapNode = mapQuery.data?.nodes.find((n) => n.name === nodeName);
  const mapPod = mapNode?.pods.find((x) => x.pod === podName);
  const namespace = mapPod?.namespace;

  const nodeDetailQuery = useNodeDetailQuery(nodeName);
  const detailQuery = usePodDetailQuery(namespace, podName);
  const incidentsQuery = useIncidentsQuery({ node: nodeName, pod: podName });
  const egressQuery = useLatencyBreakdownQuery({ scope: "pod", direction: "egress", node: nodeName, limit: 100 });
  const ingressQuery = useLatencyBreakdownQuery({ scope: "pod", direction: "ingress", node: nodeName, limit: 100 });
  const dropsQuery = useDropsQuery({ node: nodeName, limit: 100 });
  const bandwidthQuery = useBandwidthQuery({ node: nodeName, limit: 100 });
  const noisyQuery = useNoisyNeighborQuery({ limit: 500 });
  const gpuStatusQuery = useQuery({ ...gpuStatusQueryOptions({ node: nodeName }), enabled: !!mapNode?.gpu });

  if (mapQuery.isError && isNotFoundError(mapQuery.error)) notFound();
  if (mapQuery.isPending) return <PageLoading node={nodeName} pod={podName} message="파드 정보를 불러오는 중…" />;
  if (!mapNode) {
    return <PageLoading node={nodeName} pod={podName} message="노드 정보를 불러오지 못했습니다." error />;
  }
  // 노드 관측 윈도에 없는 파드 = 존재하지 않거나 이미 삭제됨
  if (!mapPod || !namespace) notFound();

  const pod = mapPod;
  const detail = detailQuery.data;
  const telemetry = podHasTelemetry(detail);
  const noData = !telemetry && pod.status !== "down" && pod.status !== "warning" && !detailQuery.isPending;

  const incidents = incidentsQuery.data?.incidents ?? [];
  const noisy = toNoisyRows(noisyQuery.data?.items, new Set([pod.pod])).filter((r) => r.suspect === pod.pod || r.victim === pod.pod);
  const isSuspect = noisy.some((r) => r.suspect === pod.pod);
  const diagnosis = toPodDiagnosis(pod, detail, incidents, noisy);
  const health = detail ? toPodHealth(detail) : null;
  const alerts = toNodeAlerts(incidents, new Set([pod.pod]));
  const stages = toPodStages(egressQuery.data, ingressQuery.data, namespace, pod.pod);
  const drops = toPodDrops(dropsQuery.data, namespace, pod.pod);
  const bw = podBandwidth(bandwidthQuery.data, namespace, pod.pod);
  // 파드 관점 GPU 사용 (GPU 노드일 때만 non-null)
  const gpuUsage = mapNode.gpu ? toPodGpuUsage(gpuStatusQuery.data, namespace, pod.pod) : null;
  const dim = diagnosis?.dimension;

  const nodeTone = DISPLAY_STATUS_TONE[toNodeDisplayStatus(nodeDetailQuery.data, mapNode)];
  // 파드 상태 — node-map 판정과 일치. 텔레메트리 없으면 회색 "데이터 없음".
  const podState = podDisplayStatusOf(pod);
  const podTone = noData ? NODATA_TONE : podState === "nodata" ? DISPLAY_STATUS_TONE.ok : DISPLAY_STATUS_TONE[podState];

  const v = detail?.vitals ?? {};
  const throttle = detail?.cpu.throttled_ratio;
  const cpuPct = v.cpu_percent != null ? Math.round(v.cpu_percent) : null;
  const memPct = v.memory_percent != null ? Math.round(v.memory_percent) : null;
  const netPct = bw?.nicPct != null ? Math.round(bw.nicPct * 100) / 100 : null;
  const memText = v.memory_working_set_bytes != null ? `${(v.memory_working_set_bytes / 1024 ** 2).toFixed(0)}MiB` : null;

  const vitalTiles: VitalTile[] = [
    {
      kind: "gauge",
      label: "CPU",
      pct: cpuPct ?? 0,
      center: cpuPct == null ? "—" : undefined,
      sub: cpuPct != null ? "limit 대비 사용률" : v.cpu_usage_cores != null ? `${v.cpu_usage_cores.toFixed(3)} cores · limit 없음` : "데이터 없음",
    },
    {
      kind: "gauge",
      label: "Memory",
      pct: memPct ?? 0,
      center: memPct == null ? "—" : undefined,
      sub: memText ? `working set ${memText}${memPct == null ? " · limit 없음" : ""}` : "데이터 없음",
    },
    {
      kind: "gauge",
      label: "Network",
      pct: netPct ?? 0,
      center: netPct == null ? "—" : undefined,
      sub: bw ? `RX ${bw.rxMbps} · TX ${bw.txMbps} Mbps` : "데이터 없음",
    },
    {
      kind: "gauge",
      label: "CPU throttle",
      pct: throttle != null ? Math.round(throttle * 100) : 0,
      center: throttle == null ? "—" : undefined,
      sub: throttle != null ? "0=정상 100=심각" : "limit 없음 — 측정 불가",
    },
  ];
  // 이력 API 가 없어 실측 현재값(30s 갱신)을 그대로 흘린다 — 미측정 차원은 시리즈 제외
  const liveSeries: StreamSeries[] = [
    ...(cpuPct != null ? [{ key: "cpu", label: "CPU", color: "#6366f1", base: cpuPct, unit: "%", vol: 5 }] : []),
    ...(memPct != null ? [{ key: "mem", label: "Memory", color: "#0ea5e9", base: memPct, unit: "%", vol: 4 }] : []),
    ...(netPct != null ? [{ key: "net", label: "Network", color: "#14b8a6", base: netPct, unit: "%", vol: 6 }] : []),
  ];

  // 답(verdict) + Vitals 요약 영역이 "개요"를 대체 — 탭은 자원별 심층(Datadog/Grafana 관례).
  const tabs: TabDef[] = [
    {
      id: "cpu",
      label: "CPU",
      alert: dim === "cpu",
      content: (
        <Card title="CPU throttle (cpu_throttle_score)">
          <div className="grid grid-cols-2 gap-3">
            <StatChip
              label="throttle score"
              value={throttle != null ? throttle.toFixed(2) : "—"}
              sub={throttle != null ? "0=정상 · 1=심각" : "limit 없음 — 측정 불가"}
              tone={throttle != null && throttle > 0.6 ? "text-rose-600" : "text-slate-900"}
            />
            <StatChip
              label="CPU health"
              value={detail?.health.cpu != null ? detail.health.cpu.toFixed(2) : "—"}
              sub={detail?.health.cpu != null ? "1=정상" : "미산출"}
              tone={detail?.health.cpu != null ? healthToneClass(detail.health.cpu) : "text-slate-900"}
            />
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <MetricBar label="CPU 사용률" value={cpuPct ?? -1} />
          </div>
          <p className="mt-3 text-[11px] text-slate-500">cgroup cpu.stat throttled_time 비율 기반. 사용률이 낮아도 quota 경합 시 throttle 이 높을 수 있습니다.</p>
        </Card>
      ),
    },
    {
      id: "net",
      label: "네트워크",
      alert: dim === "net" || dim === "latency",
      content: (
        <Card>
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-sm font-bold text-slate-700">Send path stage latency p99 (eBPF TX 경로)</h3>
            <span className="text-[11px] text-slate-500">
              병목: <span className="font-mono font-semibold text-rose-600">{stages.tx.bottleneck}</span>
            </span>
          </div>
          <p className="mb-3 text-[11px] text-slate-500">sendmsg → tcp_transmit → tcp_write_xmit → devq → veth 단계별 지연</p>
          {stages.tx.stages.length ? <StageLatency stages={stages.tx.stages} bottleneck={stages.tx.bottleneck} /> : <EmptyState message="데이터 없음" />}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-1 flex items-baseline justify-between">
              <h3 className="text-sm font-bold text-slate-700">Receive path stage latency p99 (eBPF RX 경로)</h3>
              <span className="text-[11px] text-slate-500">
                병목: <span className="font-mono font-semibold text-rose-600">{stages.rx.bottleneck}</span>
              </span>
            </div>
            <p className="mb-3 text-[11px] text-slate-500">rcv_demux → rcv_established → rcv_app 단계별 지연</p>
            {stages.rx.stages.length ? (
              <StageLatency stages={stages.rx.stages} bottleneck={stages.rx.bottleneck} />
            ) : (
              <EmptyState message="데이터 없음 — 파드 입도 수신 경로는 미수집" />
            )}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-[12px] font-semibold text-slate-500">Drop / retrans rate (워크로드 단위)</p>
            <ScoreBars items={drops} kind="rate" unit="/s" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <StatChip label="RX 대역폭" value={bw ? `${bw.rxMbps}` : "—"} sub={bw ? `Mbps · ${bw.rxText}` : "데이터 없음"} />
            <StatChip label="TX 대역폭" value={bw ? `${bw.txMbps}` : "—"} sub={bw ? `Mbps · ${bw.txText}` : "데이터 없음"} />
          </div>
        </Card>
      ),
    },
    {
      id: "noisy",
      label: "간섭",
      badge: noisy.length || undefined,
      content: (
        <Card>
          {noisy.length > 0 ? (
            <>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-700">Noisy neighbor 관여</h3>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${isSuspect ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                  {isSuspect ? "suspect (가해)" : "victim (피해)"}
                </span>
              </div>
              <NoisyPanel rows={noisy} highlight={pod.pod} />
            </>
          ) : (
            <p className="text-[12px] text-slate-500">이 파드와 연관된 noisy neighbor 신호가 없습니다.</p>
          )}
        </Card>
      ),
    },
    {
      id: "alerts",
      label: "알림",
      badge: alerts.length || undefined,
      content: (
        <Card title={`Active alerts (${alerts.length})`}>
          <AlertList node={nodeName} alerts={alerts} />
        </Card>
      ),
    },
  ];

  // GPU 노드의 파드면 네트워크 탭 뒤에 GPU 탭 삽입 (파드 관점 GPU 사용 요약)
  if (gpuUsage) {
    const at = tabs.findIndex((t) => t.id === "net") + 1;
    tabs.splice(at, 0, {
      id: "gpu",
      label: "GPU",
      badge: gpuUsage.entries.length || undefined,
      content: (
        <Card title="GPU 사용 (이 파드 관점)" hint="이 파드가 점유한 GPU·SM·메모리 (귀속분). 카드 클릭 시 해당 GPU Detail로 이동해 '누가 이 GPU를 쓰는지' 반대 관점을 볼 수 있습니다.">
          <PodGpuPanel usage={gpuUsage} node={nodeName} />
        </Card>
      ),
    });
  }

  const initialTab = dim === "cpu" ? "cpu" : dim === "net" || dim === "latency" ? "net" : dim === "node" ? "alerts" : "cpu";

  return (
    <AppShell
      crumbs={[
        { label: "Anomaly Map", href: "/" },
        { label: nodeName, href: `/clusters/${nodeName}`, dot: nodeTone.dot },
        { label: pod.pod, dot: podTone.dot },
      ]}
    >
      <div className="space-y-6">
        <EntityHeader
          kind="Pod"
          title={pod.pod}
          statusDot={podTone.dot}
          statusLabel={podTone.label}
          pills={
            <>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{namespace}</span>
              {gpuUsage ? (
                <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">GPU</span>
              ) : null}
            </>
          }
          facts={[
            { label: "Namespace", value: namespace },
            {
              label: "Node",
              value: (
                <Link href={`/clusters/${nodeName}`} className="transition-colors hover:text-sky-600 hover:underline">
                  {nodeName}
                </Link>
              ),
            },
          ]}
        />

        {detailQuery.isPending ? (
          <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />
            <span className="text-[13px]">파드 텔레메트리를 불러오는 중…</span>
          </div>
        ) : noData ? (
          <>
            <div className="surface-card rounded-xl p-5 text-sm font-semibold text-slate-500">
              데이터 없음 (no data) · 이 파드의 텔레메트리가 수집되지 않습니다
              {pod.no_data_reason ? <span className="ml-1 font-mono text-[12px] font-medium">({pod.no_data_reason})</span> : null}
              {detail?.summary ? <p className="mt-1 text-[12px] font-normal">{detail.summary}</p> : null}
            </div>
            {alerts.length > 0 ? (
              <section>
                <SectionTitle>알림</SectionTitle>
                <Card title={`Active alerts (${alerts.length})`}>
                  <AlertList node={nodeName} alerts={alerts} />
                </Card>
              </section>
            ) : null}
          </>
        ) : (
          <>
            {/* ── 답(verdict) + Vitals 요약 행 (좌 결론·우 KPI) ── */}
            <div className="grid items-start gap-4 lg:grid-cols-3">
              {diagnosis ? (
                <div className="lg:col-span-2">
                  <DiagnosisCard node={nodeName} dx={diagnosis} />
                </div>
              ) : null}
              <section className={diagnosis ? "lg:col-span-1" : "lg:col-span-3"}>
                <SectionTitle right={<span className="text-[11px] text-slate-500">live · 30s</span>}>Vitals</SectionTitle>
                <div className={`grid grid-cols-2 gap-3 ${diagnosis ? "" : "sm:grid-cols-4"}`}>
                  <LiveVitals tiles={vitalTiles} synthetic={false} />
                </div>
              </section>
            </div>

            {/* ── 실시간 사용률 — 이 파드의 CPU/Mem/Net 실측을 스트리밍 시계열로 ── */}
            <section>
              <SectionTitle right={<span className="text-[11px] text-slate-500">streaming · 30s</span>}>실시간 사용률</SectionTitle>
              <Card>
                {liveSeries.length ? (
                  <LiveArea key={liveSeries.map((s) => s.key).join()} series={liveSeries} max={100} caption="live · 30s" synthetic={false} />
                ) : (
                  <EmptyState message="limit 대비 사용률 데이터 없음 — limit 미설정 파드" />
                )}
              </Card>
            </section>

            {/* ── Health: 차원별 합성 건강도(0–1) ── */}
            <section>
              <SectionTitle>Health</SectionTitle>
              {health ? <HealthScores scores={health} /> : <EmptyState message="데이터 없음" />}
            </section>

            {/* ── 상세 (탭으로 분류) ── */}
            <section>
              <SectionTitle>상세 분석</SectionTitle>
              <Tabs tabs={tabs} initial={initialTab} />
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function PageLoading({ node, pod, message, error }: { node: string; pod: string; message: string; error?: boolean }) {
  return (
    <AppShell
      crumbs={[
        { label: "Anomaly Map", href: "/" },
        { label: node, href: `/clusters/${node}` },
        { label: pod },
      ]}
    >
      <div className="mt-16 flex flex-col items-center gap-2 text-slate-400">
        {error ? null : <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />}
        <span className={`text-[13px] ${error ? "font-semibold text-slate-600" : ""}`}>{message}</span>
      </div>
    </AppShell>
  );
}
