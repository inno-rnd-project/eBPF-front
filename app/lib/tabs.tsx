"use client";

// ───────────────────────────────────────────────────────────────────────────
// 탭 — 드릴다운 정보를 카테고리로 분류 (서버에서 렌더한 content를 받아 전환)
// ───────────────────────────────────────────────────────────────────────────

import { useState } from "react";

export type TabDef = {
  id: string;
  label: string;
  badge?: number | string;
  alert?: boolean; // 좌측 빨간 점 (주요 원인 강조)
  content: React.ReactNode;
};

// primary = 상위(노드) 탭 — 밑줄형. secondary = 하위(예: GPU 내부) 탭 — 알약형 세그먼트.
export function Tabs({
  tabs,
  initial,
  variant = "primary",
}: {
  tabs: TabDef[];
  initial?: string;
  variant?: "primary" | "secondary";
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const cur = tabs.find((t) => t.id === active) ?? tabs[0];

  if (variant === "secondary") {
    return (
      <div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.alert ? <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> : null}
                {t.label}
                {t.badge != null ? (
                  <span className={`rounded px-1.5 text-[10px] font-semibold ${on ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-600"}`}>
                    {t.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="pt-4">{cur?.content}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-0.5 border-b border-slate-200">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium transition-colors ${
                on ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.alert ? <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> : null}
              {t.label}
              {t.badge != null ? (
                <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">{t.badge}</span>
              ) : null}
              {on ? <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-sky-500" /> : null}
            </button>
          );
        })}
      </div>
      <div className="pt-5">{cur?.content}</div>
    </div>
  );
}
