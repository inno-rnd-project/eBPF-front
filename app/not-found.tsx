import Link from "next/link";

import { HEX_CLIP } from "./lib/cluster";
import { NavRail } from "./lib/shell";

// 404 — 존재하지 않는 노드/파드 또는 잘못된 경로
export default function NotFound() {
  return (
    <main className="flex min-h-screen bg-white text-slate-900">
      <NavRail />
      <div className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="surface-card w-full max-w-md rounded-2xl p-8 text-center">
        <span
          aria-hidden
          className={`mx-auto mb-5 flex h-12 w-12 items-center justify-center bg-linear-to-br from-indigo-500 to-sky-500 text-white ${HEX_CLIP}`}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
            <path d="M12 2.5l8.5 4.9v9.2L12 21.5 3.5 16.6V7.4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2.4" fill="currentColor" />
          </svg>
        </span>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">404 · Not Found</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight">대상을 찾을 수 없습니다</h1>
        <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-slate-500">
          요청한 노드 또는 파드가 클러스터에 존재하지 않거나, 경로가 더 이상 유효하지 않습니다.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-slate-700"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5l-5 5 5 5" />
          </svg>
          Anomaly Map으로 돌아가기
        </Link>
        </div>
      </div>
    </main>
  );
}
