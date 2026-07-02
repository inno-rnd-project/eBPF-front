// ───────────────────────────────────────────────────────────────────────────
// 앱 셸 — 제품 전반의 영속 크롬 (맵/드릴다운 공용)
//   · NavRail        : 좌측 다크 네비 레일 (Datadog 3-zone 아이콘 레일 관례)
//   · AppShell       : NavRail + 브레드크럼 탑바 + 콘텐츠 캔버스
//   · Breadcrumb     : 계층 경로 (Grafana Saga: 모든 페이지에 계층 기반 브레드크럼)
//   · EntityHeader   : 상세 페이지 신원 헤더 (상태 + 이름 + 배지 + 핵심 facts)
// 드릴다운 페이지는 좁은 max-w-3xl 단일 칼럼 대신 이 셸을 입어 맵과 동일한
// "옵저버빌리티 제품" 외형을 갖는다.
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";

import { HEX_CLIP } from "./cluster";

function NavIcon({ active, children, label }: { active?: boolean; children: React.ReactNode; label: string }) {
  return (
    <span
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
        active ? "bg-white/10 text-white" : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
      }`}
    >
      {children}
    </span>
  );
}

// 좌측 다크 네비 레일 — 맵 페이지에서 추출, 시각적으로 동일.
export function NavRail({ active = "map" }: { active?: "map" | "dashboards" | "topology" }) {
  return (
    <aside className="hidden w-12 shrink-0 flex-col items-center gap-1 bg-[#15151f] py-3 sm:flex">
      <Link
        href="/"
        aria-label="Anomaly Map 홈"
        className={`mb-3 flex h-8 w-8 items-center justify-center bg-linear-to-br from-indigo-500 to-sky-500 text-white ${HEX_CLIP}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
          <path d="M12 2.5l8.5 4.9v9.2L12 21.5 3.5 16.6V7.4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.4" fill="currentColor" />
        </svg>
      </Link>
      <Link href="/">
        <NavIcon active={active === "map"} label="Anomaly Map">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M7 3h6l3 5-3 5H7L4 8zm9 8h2l3 5-3 5h-6l-1.5-2.5L13 16z" />
          </svg>
        </NavIcon>
      </Link>
      <NavIcon active={active === "dashboards"} label="Dashboards">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="6" rx="1.5" />
          <rect x="3" y="14" width="18" height="6" rx="1.5" />
        </svg>
      </NavIcon>
      <NavIcon active={active === "topology"} label="Topology">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <circle cx="12" cy="18" r="2.5" />
          <path d="M8 7l8 0M7 8l4 8M17 8l-4 8" />
        </svg>
      </NavIcon>
    </aside>
  );
}

export type Crumb = { label: string; href?: string; dot?: string };

// 브레드크럼 탑바 — 계층 경로 + 우측 라이브 표시. sticky 로 스크롤해도 위치 유지.
function BreadcrumbBar({ crumbs, meta }: { crumbs: Crumb[]; meta?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/85 px-4 py-2 text-[12px] text-slate-500 backdrop-blur">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="currentColor">
        <rect x="2" y="2" width="5" height="5" />
        <rect x="9" y="2" width="5" height="5" />
        <rect x="2" y="9" width="5" height="5" />
        <rect x="9" y="9" width="5" height="5" />
      </svg>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-2">
              {i > 0 ? <span className="text-slate-300">/</span> : null}
              {c.dot ? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.dot }} /> : null}
              {c.href && !last ? (
                <Link href={c.href} className="truncate transition-colors hover:text-sky-600 hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className={`truncate ${last ? "font-semibold text-slate-700" : ""}`}>{c.label}</span>
              )}
            </span>
          );
        })}
      </nav>
      <span className="ml-auto shrink-0">
        {meta ?? (
          <span className="flex items-center gap-1.5 rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            15m · Live
          </span>
        )}
      </span>
    </div>
  );
}

// 드릴다운 페이지 셸 — NavRail + 브레드크럼 + 넓은 캔버스(max-w-6xl).
export function AppShell({
  crumbs,
  meta,
  children,
}: {
  crumbs: Crumb[];
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // h-screen + overflow-hidden → NavRail/브레드크럼은 고정, 콘텐츠만 스크롤(제품형 셸)
    <main className="flex h-screen overflow-hidden bg-white text-slate-900">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <BreadcrumbBar crumbs={crumbs} meta={meta} />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-5 py-6 sm:px-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

export type Fact = { label: string; value: React.ReactNode; tone?: string };

// 신원 헤더 — 상태 + 이름 + 종류/배지 + 우측 핵심 facts(용량·메타).
// Datadog 패널 헤더 / Grafana "identity as stat tiles" 관례. GPU 상세의 스펙
// 스트립을 일반화해 모든 상세 페이지가 같은 헤더 언어를 쓰게 한다.
export function EntityHeader({
  kind,
  title,
  statusDot,
  statusLabel,
  pills,
  facts,
}: {
  kind: string;
  title: string;
  statusDot: string;
  statusLabel: string;
  pills?: React.ReactNode;
  facts?: Fact[];
}) {
  return (
    <header className="flex flex-wrap items-start gap-x-6 gap-y-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{kind}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: statusDot }} />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <span className="text-sm text-slate-500">{statusLabel}</span>
          {pills}
        </div>
      </div>
      {facts && facts.length > 0 ? (
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-3 sm:ml-auto">
          {facts.map((f) => (
            <div key={f.label} className="border-l border-slate-200 pl-4 first:border-0 first:pl-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{f.label}</dt>
              <dd className={`mt-0.5 text-[13px] font-bold tabular-nums ${f.tone ?? "text-slate-700"}`}>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}

// 섹션 제목 — "HEALTH", "상세 분석" 류의 소제목. 페이지 간 일관 유지.
export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{children}</h2>
      {right}
    </div>
  );
}
