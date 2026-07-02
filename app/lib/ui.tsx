// ───────────────────────────────────────────────────────────────────────────
// 상세 페이지 공용 표시 컴포넌트 (순수 서버 컴포넌트)
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";

import { HEX_CLIP, rampColor } from "./cluster";

export function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold text-slate-700">{value < 0 ? "—" : `${value}%`}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${value < 0 ? 0 : value}%`, backgroundColor: rampColor(value) }}
        />
      </div>
    </div>
  );
}

// 공용 빈 상태 — 패널 전반의 "데이터/신호 없음"을 일관된 톤으로 (Datadog/Grafana
// "no data" 관례). 메시지만 바꿔 어디서나 동일한 형태로 쓴다.
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 py-3 text-[12px] text-slate-500">
      <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="10" cy="10" r="7" />
        <path d="M5.5 5.5l9 9" strokeLinecap="round" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

// ── 공용 카드 — 상세 페이지의 최상위 표면 (node/pod 공용) ─────────────────────
export function Card({
  title,
  hint,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-card rounded-xl p-5 ${className}`}>
      {title ? (
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700">
          {title}
          {hint ? <InfoDot hint={hint} /> : null}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

// 도움말 인포닷 — CSS-only hover/focus 팝오버 (클라이언트 JS 불필요, 키보드 접근 가능)
export function InfoDot({ hint }: { hint: string }) {
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        role="button"
        aria-label={hint}
        className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500 outline-none transition-colors hover:bg-slate-300 focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        ?
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 translate-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-slate-600 opacity-0 shadow-lg transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-slate-200 bg-white" />
        {hint}
      </span>
    </span>
  );
}

// 허니콤 범례용 육각 칩 (맵/노드 페이지 공용)
export function LegendHex({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2.5 w-2.5 ${HEX_CLIP}`} style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[13px] text-slate-500 transition-colors hover:text-slate-800">
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5l-5 5 5 5" />
      </svg>
      {children}
    </Link>
  );
}
