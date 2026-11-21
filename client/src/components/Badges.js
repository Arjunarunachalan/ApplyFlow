const STATUS_STYLES = {
  new: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  draft: "bg-violet-50 text-violet-700 ring-violet-200",
  draft_ready: "bg-violet-50 text-violet-700 ring-violet-200",
  approved: "bg-sky-50 text-sky-700 ring-sky-200",
  queued: "bg-amber-50 text-amber-700 ring-amber-200",
  sent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  replied: "bg-teal-50 text-teal-700 ring-teal-200",
  interview: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
};

const TYPE_STYLES = {
  email: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  portal: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  unknown: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

const base =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset";

export function StatusBadge({ status = "new" }) {
  const label = String(status).replace(/_/g, " ");
  return (
    <span className={`${base} ${STATUS_STYLES[status] || STATUS_STYLES.new}`}>{label}</span>
  );
}

export function TypeBadge({ type = "unknown" }) {
  return (
    <span className={`${base} ${TYPE_STYLES[type] || TYPE_STYLES.unknown}`}>{type}</span>
  );
}

const matchStyle = (score) => {
  if (score >= 70) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (score >= 40) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-zinc-100 text-zinc-600 ring-zinc-200";
};

export function MatchBadge({ score = 0 }) {
  const value = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  return (
    <span className={`${base} ${matchStyle(value)} tabular-nums`}>{value}% match</span>
  );
}
