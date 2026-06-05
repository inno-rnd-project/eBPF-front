"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PHASE_META, type PodPhase } from "../../lib/k8s";

interface NavItem {
  href: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
}

const ICON = "h-4 w-4 shrink-0";

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Overview",
    sub: "클러스터 토폴로지",
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/latency",
    label: "Latency",
    sub: "네트워크 지연 분석",
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 17l5-6 4 3 5-7 4 5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/drops",
    label: "Drops",
    sub: "패킷 Drop · 오류",
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3s6 6 6 10a6 6 0 11-12 0c0-4 6-10 6-10z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/interference",
    label: "Interference",
    sub: "간섭 Top-N · 상관",
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 20V10M10 20V4M16 20v-8M22 20h-20" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/gpu",
    label: "GPU",
    sub: "GPU 통합 간섭",
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M7 10h4v4H7zM15 12h2" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-4 py-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          eBPF Observability
        </div>
        <div className="mt-1 font-semibold text-zinc-100">GPU Cluster Insight</div>
        <div className="text-xs text-zinc-600">Phase 1 · 커널 레벨 관측</div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition ${
                active
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              <span className={active ? "text-emerald-400" : "text-zinc-500"}>{item.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-tight">{item.label}</span>
                <span className="block truncate text-[11px] text-zinc-600">{item.sub}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-800 px-4 py-3">
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-600">Pod phase</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {(Object.keys(PHASE_META) as PodPhase[]).map((ph) => (
            <span key={ph} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: PHASE_META[ph].hex }} />
              {ph}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}
