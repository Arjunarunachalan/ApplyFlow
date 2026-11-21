export default function StatCard({ label, value, icon: Icon, accent = "text-indigo-600", hint }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">{value}</p>
        </div>
        {Icon ? (
          <span className={`rounded-lg bg-zinc-50 p-2 ${accent}`}>
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-3 text-xs text-zinc-400">{hint}</p> : null}
    </div>
  );
}
