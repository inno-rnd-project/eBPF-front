"use client";

export interface BarRow {
  key: string;
  label: string;
  value: number;
  color?: string;
  sub?: string;
}

interface HorizontalBarProps {
  data: BarRow[];
  valueFormat?: (v: number) => string;
  max?: number;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
}

export default function HorizontalBar({
  data,
  valueFormat = (v) => `${v}`,
  max,
  selectedKey,
  onSelect,
}: HorizontalBarProps) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-1.5">
      {data.map((row) => {
        const pct = (row.value / top) * 100;
        const selected = row.key === selectedKey;
        return (
          <button
            key={row.key}
            onClick={() => onSelect?.(row.key)}
            disabled={!onSelect}
            className={`flex w-full items-center gap-3 rounded-md px-2 py-1 text-left transition ${
              onSelect ? "hover:bg-zinc-800/60" : "cursor-default"
            } ${selected ? "bg-zinc-800" : ""}`}
          >
            <div className="w-36 shrink-0 truncate text-xs text-zinc-300" title={row.label}>
              {row.label}
              {row.sub ? <span className="ml-1 text-zinc-600">{row.sub}</span> : null}
            </div>
            <div className="h-3 flex-1 overflow-hidden rounded bg-zinc-800/70">
              <div
                className="h-full rounded transition-[width] duration-500"
                style={{ width: `${pct}%`, background: row.color ?? "#38bdf8" }}
              />
            </div>
            <div className="w-16 shrink-0 text-right text-xs font-medium tabular-nums text-zinc-200">
              {valueFormat(row.value)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
