"use client";

// 라우트 에러 바운더리 — 렌더/데이터 예외 시 폴백. reset()으로 재시도.
import Link from "next/link";
import { useEffect } from "react";

import { NavRail } from "./lib/shell";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 프로덕션에선 관측 백엔드로 전송 (Sentry 등). 지금은 콘솔.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen bg-white text-slate-900">
      <NavRail />
      <div className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="surface-card w-full max-w-md rounded-2xl p-8 text-center">
        <span
          aria-hidden
          className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 8v5" strokeLinecap="round" />
            <circle cx="12" cy="16.5" r="0.4" fill="currentColor" stroke="none" />
            <path d="M10.3 3.9 2.6 17.3a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">오류 발생</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight">화면을 불러오지 못했습니다</h1>
        <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-slate-500">
          텔레메트리 처리 중 예기치 못한 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-slate-500">digest: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-slate-700"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 10a6 6 0 1 1 1.8 4.3M4 10V6m0 4h4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            다시 시도
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            Anomaly Map
          </Link>
        </div>
        </div>
      </div>
    </main>
  );
}
