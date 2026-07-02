import Link from "next/link";
import { notFound } from "next/navigation";

import {
  DISPLAY_STATUS_TONE,
  getNode,
  nodeDisplayStatus,
  nodeNoisyNeighbors,
  podAlertList,
  podAnalytics,
  podDiagnosis,
  podGpuUsage,
  podHealth,
} from "../../../lib/cluster";
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
import { LiveArea, LiveVitals } from "../../../lib/live";
import { AppShell, EntityHeader, SectionTitle } from "../../../lib/shell";
import { type TabDef, Tabs } from "../../../lib/tabs";
import { Card, MetricBar } from "../../../lib/ui";

export default async function PodPage({ params }: { params: Promise<{ node: string; pod: string }> }) {
  const { node: nodeName, pod: podName } = await params;
  const node = getNode(decodeURIComponent(nodeName));
  const pod = node?.pods.find((p) => p.name === decodeURIComponent(podName));
  if (!node || !pod) notFound();

  const noData = pod.cpu < 0;
  const diagnosis = podDiagnosis(node, pod);
  const health = podHealth(node, pod);
  const an = podAnalytics(node, pod);
  const alerts = podAlertList(node, pod);
  const noisy = nodeNoisyNeighbors(node).filter((r) => r.suspect === pod.name || r.victim === pod.name);
  const isSuspect = noisy.some((r) => r.suspect === pod.name);
  const namespace = pod.name.replace(/-\d+$/, "");
  // 파드 관점 GPU 사용 (GPU 노드일 때만 non-null)
  const gpuUsage = podGpuUsage(node, pod);
  const dim = diagnosis?.dimension;

  const nodeTone = DISPLAY_STATUS_TONE[nodeDisplayStatus(node)];
  // 파드 상태 — 진단 severity 와 일치. 텔레메트리 없으면 회색 "데이터 없음".
  const podTone = noData ? { dot: "#cbd5e1", label: "데이터 없음" } : DISPLAY_STATUS_TONE[diagnosis?.severity ?? "ok"];

  // 답(verdict) + Vitals 요약 영역이 "개요"를 대체 — 탭은 자원별 심층(Datadog/Grafana 관례).
  const tabs: TabDef[] = [
    {
      id: "cpu",
      label: "CPU",
      alert: dim === "cpu",
      content: (
        <Card title="CPU throttle (cpu_throttle_score)">
          <div className="grid grid-cols-2 gap-3">
            <StatChip label="throttle score" value={an.throttle.toFixed(2)} sub="0=정상 · 1=심각" tone={an.throttle > 0.6 ? "text-rose-600" : "text-slate-900"} />
            <StatChip label="CPU health" value={health.cpu.toFixed(2)} sub="1=정상" tone={healthToneClass(health.cpu)} />
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <MetricBar label="CPU 사용률" value={pod.cpu} />
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
              병목: <span className="font-mono font-semibold text-rose-600">{an.bottleneck}</span>
            </span>
          </div>
          <p className="mb-3 text-[11px] text-slate-500">sendmsg → tcp_transmit → tcp_write_xmit → devq → veth 단계별 지연</p>
          <StageLatency stages={an.stages} bottleneck={an.bottleneck} />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-1 flex items-baseline justify-between">
              <h3 className="text-sm font-bold text-slate-700">Receive path stage latency p99 (eBPF RX 경로)</h3>
              <span className="text-[11px] text-slate-500">
                병목: <span className="font-mono font-semibold text-rose-600">{an.rxBottleneck}</span>
              </span>
            </div>
            <p className="mb-3 text-[11px] text-slate-500">rcv_demux → rcv_established → rcv_app 단계별 지연</p>
            <StageLatency stages={an.rxStages} bottleneck={an.rxBottleneck} />
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-[12px] font-semibold text-slate-500">Drop / retrans rate</p>
            <ScoreBars items={an.drops.map((d) => ({ label: d.category, value: d.rate }))} kind="rate" unit="/s" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <StatChip label="RX 대역폭" value={`${an.rx}`} sub="Mbps" />
            <StatChip label="TX 대역폭" value={`${an.tx}`} sub="Mbps" />
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
              <NoisyPanel rows={noisy} highlight={pod.name} />
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
          <AlertList node={node.name} alerts={alerts} />
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
        <Card title="GPU 사용 (이 파드 관점)" hint="이 파드가 점유한 GPU·SM·메모리·커널 런치 (귀속분). 카드 클릭 시 해당 GPU Detail로 이동해 '누가 이 GPU를 쓰는지' 반대 관점을 볼 수 있습니다.">
          <PodGpuPanel usage={gpuUsage} node={node.name} />
        </Card>
      ),
    });
  }

  const initialTab = dim === "cpu" ? "cpu" : dim === "net" || dim === "latency" ? "net" : dim === "node" ? "alerts" : "cpu";

  return (
    <AppShell
      crumbs={[
        { label: "Anomaly Map", href: "/" },
        { label: node.name, href: `/clusters/${node.name}`, dot: nodeTone.dot },
        { label: pod.name, dot: podTone.dot },
      ]}
    >
      <div className="space-y-6">
        <EntityHeader
          kind="Pod"
          title={pod.name}
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
                <Link href={`/clusters/${node.name}`} className="transition-colors hover:text-sky-600 hover:underline">
                  {node.name}
                </Link>
              ),
            },
          ]}
        />

        {noData ? (
          <>
            <div className="surface-card rounded-xl p-5 text-sm font-semibold text-slate-500">
              데이터 없음 (no data) · 이 파드의 텔레메트리가 수집되지 않습니다
            </div>
            {alerts.length > 0 ? (
              <section>
                <SectionTitle>알림</SectionTitle>
                <Card title={`Active alerts (${alerts.length})`}>
                  <AlertList node={node.name} alerts={alerts} />
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
                  <DiagnosisCard node={node.name} dx={diagnosis} />
                </div>
              ) : null}
              <section className={diagnosis ? "lg:col-span-1" : "lg:col-span-3"}>
                <SectionTitle right={<span className="text-[11px] text-slate-500">live · 15m</span>}>Vitals</SectionTitle>
                <div className={`grid grid-cols-2 gap-3 ${diagnosis ? "" : "sm:grid-cols-4"}`}>
                  <LiveVitals
                    tiles={[
                      { kind: "gauge", label: "CPU", pct: pod.cpu, sub: "사용률" },
                      { kind: "gauge", label: "Memory", pct: pod.mem, sub: `pressure ${an.memPressure.toFixed(2)}` },
                      { kind: "gauge", label: "Network", pct: pod.net, sub: `RX ${an.rx} · TX ${an.tx} Mbps` },
                      { kind: "gauge", label: "CPU throttle", pct: Math.round(an.throttle * 100), sub: "0=정상 100=심각" },
                    ]}
                  />
                </div>
              </section>
            </div>

            {/* ── 실시간 사용률 — 이 파드의 CPU/Mem/Net 을 스트리밍 시계열로 ── */}
            <section>
              <SectionTitle right={<span className="text-[11px] text-slate-500">streaming · 1s</span>}>실시간 사용률</SectionTitle>
              <Card>
                <LiveArea
                  series={[
                    { key: "cpu", label: "CPU", color: "#6366f1", base: pod.cpu, unit: "%", vol: 5 },
                    { key: "mem", label: "Memory", color: "#0ea5e9", base: pod.mem, unit: "%", vol: 4 },
                    { key: "net", label: "Network", color: "#14b8a6", base: pod.net, unit: "%", vol: 6 },
                  ]}
                  max={100}
                  caption="live · 1s"
                />
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
          </>
        )}
      </div>
    </AppShell>
  );
}
