import { NavRail } from "./lib/shell";

// 라우트 전환 중 스켈레톤 — 새 셸(NavRail + 브레드크럼 + 넓은 캔버스)을 모사.
export default function Loading() {
  return (
    <main className="flex min-h-screen bg-white text-slate-900">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 브레드크럼 바 */}
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
          <div className="h-3.5 w-3.5 rounded bg-slate-200/80" />
          <div className="h-3 w-24 rounded bg-slate-200/80" />
          <span className="text-slate-300">/</span>
          <div className="h-3 w-28 rounded bg-slate-200/70" />
        </div>

        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl animate-pulse space-y-6 px-5 py-6 sm:px-6">
            {/* 신원 헤더 */}
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-3 w-16 rounded bg-slate-200/70" />
                <div className="flex items-center gap-2.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <div className="h-7 w-44 rounded bg-slate-200/90" />
                  <div className="h-5 w-14 rounded-md bg-slate-200/70" />
                </div>
              </div>
              <div className="hidden gap-5 sm:flex">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-2.5 w-12 rounded bg-slate-200/70" />
                    <div className="h-4 w-16 rounded bg-slate-200/80" />
                  </div>
                ))}
              </div>
            </div>

            {/* 진단 카드 */}
            <div className="surface-card h-32 rounded-2xl" />

            {/* Vitals 게이지 그리드 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-36 rounded-xl border border-slate-200 bg-white" />
              ))}
            </div>

            {/* 탭 + 본문 */}
            <div className="flex gap-2 border-b border-slate-200 pb-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-5 w-14 rounded bg-slate-200/70" />
              ))}
            </div>
            <div className="surface-card h-64 rounded-xl" />
          </div>
        </div>
      </div>
    </main>
  );
}
