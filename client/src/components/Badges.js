const STATUS_STYLES = {
  // Lifecycle statuses (canonical)
  IMPORTED: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  EXTRACTION_REVIEW: "bg-amber-50 text-amber-800 ring-amber-200",
  EXTRACTION_FAILED: "bg-red-50 text-red-700 ring-red-200",
  CONTACT_DISCOVERY: "bg-sky-50 text-sky-700 ring-sky-200",
  CONTACT_AVAILABLE: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  CONTACT_NOT_FOUND: "bg-amber-50 text-amber-700 ring-amber-200",
  CONTACT_REQUIRES_REVIEW: "bg-amber-50 text-amber-800 ring-amber-200",
  EMAIL_DRAFT_PENDING: "bg-violet-50 text-violet-700 ring-violet-200",
  EMAIL_DRAFT_READY: "bg-violet-50 text-violet-700 ring-violet-200",
  EMAIL_GENERATION_FAILED: "bg-red-50 text-red-700 ring-red-200",
  AWAITING_APPROVAL: "bg-violet-50 text-violet-800 ring-violet-200",
  APPROVED: "bg-sky-50 text-sky-700 ring-sky-200",
  QUEUED: "bg-amber-50 text-amber-700 ring-amber-200",
  SENDING: "bg-amber-100 text-amber-800 ring-amber-300",
  SENT: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  SEND_FAILED: "bg-red-50 text-red-700 ring-red-200",
  NEEDS_REVIEW: "bg-orange-50 text-orange-800 ring-orange-200",
  PORTAL_APPLICATION_REQUIRED: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  ARCHIVED: "bg-zinc-100 text-zinc-500 ring-zinc-200",

  // Legacy statuses (applications & backward compatibility)
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
  archived: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};

const STATUS_LABELS = {
  IMPORTED: "Imported",
  EXTRACTION_REVIEW: "Extraction Review",
  EXTRACTION_FAILED: "Extraction Failed",
  CONTACT_DISCOVERY: "Discovering Contact",
  CONTACT_AVAILABLE: "Contact Available",
  CONTACT_NOT_FOUND: "HR Email Not Found",
  CONTACT_REQUIRES_REVIEW: "Contact Review",
  EMAIL_DRAFT_PENDING: "Draft Pending",
  EMAIL_DRAFT_READY: "Draft Ready",
  EMAIL_GENERATION_FAILED: "Draft Failed",
  AWAITING_APPROVAL: "Awaiting Approval",
  APPROVED: "Approved",
  QUEUED: "Queued",
  SENDING: "Sending",
  SENT: "Sent",
  SEND_FAILED: "Send Failed",
  NEEDS_REVIEW: "Needs Review",
  PORTAL_APPLICATION_REQUIRED: "Portal Only",
  ARCHIVED: "Archived",
};

const CONTACT_STYLES = {
  VERIFIED_PUBLIC_SOURCE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PUBLICLY_LISTED_UNVERIFIED: "bg-sky-50 text-sky-700 ring-sky-200",
  NOT_FOUND: "bg-amber-50 text-amber-700 ring-amber-200",
  INVALID_FORMAT: "bg-rose-50 text-rose-700 ring-rose-200",
  MANUAL_REVIEW_REQUIRED: "bg-orange-50 text-orange-800 ring-orange-200",
};

const CONTACT_LABELS = {
  VERIFIED_PUBLIC_SOURCE: "Verified Public Source",
  PUBLICLY_LISTED_UNVERIFIED: "Listed (Unverified)",
  NOT_FOUND: "HR Email Not Found",
  INVALID_FORMAT: "Invalid Email",
  MANUAL_REVIEW_REQUIRED: "Review Contact",
};

const TYPE_STYLES = {
  email: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  portal: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  unknown: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

const base =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap";

export function StatusBadge({ status = "new" }) {
  const label = STATUS_LABELS[status] || String(status).replace(/_/g, " ");
  return (
    <span className={`${base} ${STATUS_STYLES[status] || STATUS_STYLES.new} capitalize`}>
      {label}
    </span>
  );
}

export function ContactStatusBadge({ status = "NOT_FOUND" }) {
  const label = CONTACT_LABELS[status] || String(status).replace(/_/g, " ");
  return (
    <span className={`${base} ${CONTACT_STYLES[status] || CONTACT_STYLES.NOT_FOUND}`}>
      {label}
    </span>
  );
}

export function TypeBadge({ type = "unknown" }) {
  return (
    <span className={`${base} ${TYPE_STYLES[type] || TYPE_STYLES.unknown} capitalize`}>
      {type}
    </span>
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
