"use client";

/* eslint-disable react-hooks/set-state-in-effect */
// 이 모듈의 목적은 "외부 시스템(공용 틱 클락 · matchMedia)과의 동기화"라
// effect 내 setState 가 의도된 라이브-갱신 패턴이다. 규칙을 파일 단위로 끈다.

// ───────────────────────────────────────────────────────────────────────────
// 라이브/애니메이션 공용 프리미티브 (클라이언트)
//
// 설계 원칙 (상용 콘솔 + 어댑버서리얼 검증 반영):
//   · 단일 공용 틱 클락 — 게이지 20개가 setInterval 20개를 만들지 않게 한 곳에서 1s 펄스.
//   · SSR 안정 — 초기 state = 서버 스냅샷의 결정적 파생(시드 기반, Math.random 미사용).
//     실시간 워크의 Math.random / performance.now 는 마운트 후 effect/rAF 안에서만.
//   · prefers-reduced-motion — 워크/카운트업/스파크 갱신을 즉시 정지(접근성).
//   · 직렬화 가능한 props 만 받는다(서버→클라이언트 경계). 콜백/함수 prop 금지.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";

import { clamp, rampColor } from "./cluster";

const TICK_MS = 1000;

// ── 단일 공용 클락 ────────────────────────────────────────────────────────────
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function ensureClock() {
  if (timer == null && typeof window !== "undefined") {
    timer = setInterval(() => subs.forEach((f) => f()), TICK_MS);
  }
}
function maybeStop() {
  if (subs.size === 0 && timer != null) {
    clearInterval(timer);
    timer = null;
  }
}

// 공용 펄스를 구독해 1s 마다 증가하는 tick 을 반환. 모든 라이브 섬이 같은 프레임에 전진.
export function useTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    ensureClock();
    const fn = () => setTick((t) => t + 1);
    subs.add(fn);
    return () => {
      subs.delete(fn);
      maybeStop();
    };
  }, []);
  return tick;
}

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const fn = () => setReduce(mq.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);
  return reduce;
}

// ── 결정적 시드 버퍼 — SSR/첫 렌더가 서버·클라 동일하도록 LCG 로 생성(난수 아님) ──
function seedBuffer(base: number, n: number, seed: number, vol: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  let h = (seed >>> 0) || 1;
  let v = base;
  for (let i = 0; i < n; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const r = h / 4294967296 - 0.5; // [-0.5, 0.5]
    v = clamp(v + (base - v) * 0.18 + r * 2 * vol, lo, hi);
    out.push(v);
  }
  return out;
}

// 롤링 윈도 시계열 — 시드로 채워 시작하고, 틱마다 평균회귀 워크 한 점을 밀어넣는다.
// synthetic=false 면 랜덤워크 없이 실측 base 를 그대로 밀어넣는다 (폴링되는 실데이터용).
export function useLiveSeries(
  base: number,
  opts?: { points?: number; seed?: number; vol?: number; lo?: number; hi?: number; pull?: number; synthetic?: boolean },
): number[] {
  const { points = 40, seed = 1, vol = 6, lo = 0, hi = 100, pull = 0.16, synthetic = true } = opts ?? {};
  const tick = useTick();
  const reduce = useReducedMotion();
  const [buf, setBuf] = useState<number[]>(() => seedBuffer(base, points, seed, synthetic ? vol : 0, lo, hi));
  useEffect(() => {
    if (tick === 0 || reduce) return;
    setBuf((prev) => {
      const last = prev[prev.length - 1];
      const noise = synthetic ? (Math.random() - 0.5) * 2 * vol : 0;
      const next = synthetic ? clamp(last + (base - last) * pull + noise, lo, hi) : clamp(base, lo, hi);
      return [...prev.slice(1), next];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  return buf;
}

// ── 숫자 카운트업 — rAF, 프레임마다 표시정밀도로 반올림, 단조 수렴(정수 흔들림 방지) ──
export function Counter({
  value,
  decimals = 0,
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [disp, setDisp] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    if (reduce || fromRef.current === value) {
      setDisp(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const to = value;
    const start = performance.now();
    const dur = 480;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisp(from + (to - from) * e);
      if (t < 1) raf = requestAnimationFrame(step);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);

  const f = Math.pow(10, decimals);
  const shown = (Math.round(disp * f) / f).toFixed(decimals);
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {shown}
      {suffix}
    </span>
  );
}

// ── 라이브 게이지 — 호 스윕(dashoffset glide) + 중앙 카운트업 + 하단 미니 스파크 ──
function sparkLine(buf: number[], w: number, h: number, max: number): string {
  const n = buf.length;
  const x = (i: number) => (i / (n - 1)) * w;
  const y = (v: number) => h - (clamp(v, 0, max) / max) * h;
  return buf.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
}

function LiveGauge({
  label,
  pct,
  sub,
  center,
  seed = 1,
  synthetic = true,
}: {
  label: string;
  pct: number;
  sub?: string;
  center?: string;
  seed?: number;
  synthetic?: boolean;
}) {
  const buf = useLiveSeries(pct, { points: 32, seed, vol: 4, lo: 0, hi: 100, pull: 0.2, synthetic });
  const live = buf[buf.length - 1];
  const color = rampColor(live);
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  const offset = CIRC * (1 - clamp(live, 0, 100) / 100);
  const line = sparkLine(buf, 100, 22, 100);

  return (
    <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-3 py-4 transition-shadow hover:shadow-sm">
      <div className="relative h-[76px] w-[76px]">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="#f1f5f9" strokeWidth="9" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={CIRC.toFixed(2)}
            strokeDashoffset={offset.toFixed(2)}
            className="dash-glide"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {center != null ? (
            <span className="text-[19px] font-bold leading-none tabular-nums text-slate-900">{center}</span>
          ) : (
            <Counter value={live} suffix="%" className="text-[19px] font-bold leading-none text-slate-900" />
          )}
        </div>
      </div>
      <p className="mt-2.5 text-[12px] font-semibold text-slate-700">{label}</p>
      {/* 하단 미니 스파크 — 라이브 추세를 잔잔하게 */}
      <svg viewBox="0 0 100 22" preserveAspectRatio="none" className="mt-1.5 h-4 w-full opacity-70">
        <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      {sub ? <p className="mt-0.5 text-center text-[11px] leading-tight text-slate-500">{sub}</p> : null}
    </div>
  );
}

function StatTile({ label, value, sub, tone = "text-slate-900" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${tone}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

export type VitalTile =
  | { kind: "gauge"; label: string; pct: number; sub?: string; center?: string }
  | { kind: "stat"; label: string; value: string; sub?: string; tone?: string };

// 노드/파드 Vitals — 게이지는 라이브, stat 타일은 정적. (직렬화 가능한 tile 배열만 받음)
// synthetic=false → 폴링된 실측값을 그대로 흘린다. 기본 true 는 mock 용 랜덤워크.
export function LiveVitals({ tiles, synthetic = true }: { tiles: VitalTile[]; synthetic?: boolean }) {
  return (
    <>
      {tiles.map((t, i) =>
        t.kind === "gauge" ? (
          <LiveGauge key={t.label} label={t.label} pct={t.pct} sub={t.sub} center={t.center} seed={i * 7 + 3} synthetic={synthetic} />
        ) : (
          <StatTile key={t.label} label={t.label} value={t.value} sub={t.sub} tone={t.tone} />
        ),
      )}
    </>
  );
}

// ── 라이브 스트리밍 면적 차트 — 노드/파드에 없던 시계열(Grafana/Netdata/Datadog 관례) ──
// 우측 끝에서 새 점이 들어오고 좌측으로 흐른다. 채널별 그라데이션 면적 + 라인 + "지금" 점.
export type StreamSeries = {
  key: string;
  label: string;
  color: string;
  base: number; // 평균회귀 기준값
  unit?: string;
  vol?: number;
  pull?: number;
};

export function LiveArea({
  series,
  height = 132,
  points = 56,
  max = 100,
  caption,
  synthetic = true,
}: {
  series: StreamSeries[];
  height?: number;
  points?: number;
  max?: number;
  caption?: string;
  synthetic?: boolean;
}) {
  const tick = useTick();
  const reduce = useReducedMotion();
  const [bufs, setBufs] = useState<number[][]>(() =>
    series.map((s, i) => seedBuffer(s.base, points, i * 131 + 7, synthetic ? (s.vol ?? 6) : 0, 0, max)),
  );

  useEffect(() => {
    if (tick === 0 || reduce) return;
    setBufs((prev) =>
      prev.map((b, i) => {
        const s = series[i];
        if (!synthetic) return [...b.slice(1), clamp(s.base, 0, max)];
        const last = b[b.length - 1];
        const noise = (Math.random() - 0.5) * 2 * (s.vol ?? 6);
        const next = clamp(last + (s.base - last) * (s.pull ?? 0.14) + noise, 0, max);
        return [...b.slice(1), next];
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const W = 100;
  const H = height;
  const x = (i: number) => (i / (points - 1)) * W;
  const y = (v: number) => H - (clamp(v, 0, max) / max) * H;
  const live = bufs.length > 0;

  return (
    <div className="space-y-2">
      <div
        className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-b from-slate-50/40 to-white"
        style={{ height: H }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`la-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.34} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          {/* 기준선 그리드 — 25/50/75% */}
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1={0} y1={H * g} x2={W} y2={H * g} stroke="#eef2f7" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {bufs.map((b, i) => {
            const s = series[i];
            const linePts = b.map((v, j) => `${x(j).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
            const areaPts = `0,${H} ${linePts} ${W},${H}`;
            return (
              <g key={s.key}>
                <polygon points={areaPts} fill={`url(#la-${s.key})`} />
                <polyline
                  points={linePts}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>
        {/* "지금" 점 — 각 채널의 우측 끝 (HTML 오버레이) */}
        {bufs.map((b, i) => {
          const s = series[i];
          const v = b[b.length - 1];
          const topPct = ((H - (clamp(v, 0, max) / max) * H) / H) * 100;
          return (
            <span key={s.key} className="absolute right-[2px] -translate-y-1/2" style={{ top: `${topPct}%` }}>
              <span className="relative flex h-2 w-2">
                <span
                  className="absolute inline-flex h-full w-full rounded-full"
                  style={{ backgroundColor: s.color, animation: "liveping 1.8s ease-out infinite" }}
                />
                <span className="relative inline-flex h-2 w-2 rounded-full ring-2 ring-white" style={{ backgroundColor: s.color }} />
              </span>
            </span>
          );
        })}
      </div>
      {/* 범례 + 현재값 카운트업 */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s, i) => (
            <span key={s.key} className="flex items-center gap-1.5 text-slate-500">
              <span className="h-1.5 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
              <span>{s.label}</span>
              <Counter value={bufs[i]?.[bufs[i].length - 1] ?? s.base} suffix={s.unit ?? ""} className="font-mono font-semibold text-slate-700" />
            </span>
          ))}
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-slate-500">
          <span
            className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`}
            style={live ? { animation: "breathe 1.9s ease-in-out infinite" } : undefined}
          />
          {caption ?? "live · 1s"}
        </span>
      </div>
    </div>
  );
}
