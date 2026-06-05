interface ComingSoonProps {
  title: string;
  tag: string;
  description: string;
  planned: string[];
}

export default function ComingSoon({ title, tag, description, planned }: ComingSoonProps) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{tag}</div>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-50">{title}</h1>
      <p className="mt-2 text-sm text-zinc-400">{description}</p>

      <div className="mt-6 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          예정 (Planned)
        </div>
        <ul className="mt-3 space-y-2">
          {planned.map((p) => (
            <li key={p} className="flex gap-2 text-sm text-zinc-300">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
