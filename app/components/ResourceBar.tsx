interface ResourceBarProps {
  label: string;
  pct: number;
  detail?: string;
}

/** Color shifts from teal → amber → rose as utilization climbs. */
function barColor(pct: number): string {
  if (pct >= 90) return "bg-rose-500";
  if (pct >= 75) return "bg-amber-400";
  return "bg-emerald-400";
}

export default function ResourceBar({ label, pct, detail }: ResourceBarProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-zinc-400">{label}</span>
        <span className="tabular-nums text-zinc-300">
          {detail ? <span className="text-zinc-500">{detail}</span> : null}
          <span className="ml-2 font-semibold">{clamped.toFixed(0)}%</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${barColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
