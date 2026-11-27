"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  Calendar,
  Camera,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  FileEdit,
  Inbox,
  Loader2,
  Mail,
  MailWarning,
  Search,
  Send,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import {
  ContactStatusBadge,
  MatchBadge,
  StatusBadge,
} from "@/components/Badges";
import { useConfirm, useToast } from "@/components/ToastProvider";
import VacancyDetailModal from "@/components/VacancyDetailModal";
import { applicationApi, errorMessage } from "@/lib/api";
import { useJobStore } from "@/store/useJobStore";

const formatDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
};

export default function DashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const jobs = useJobStore((s) => s.jobs);
  const summary = useJobStore((s) => s.summary);
  const total = useJobStore((s) => s.total);
  const totalPages = useJobStore((s) => s.totalPages);
  const loading = useJobStore((s) => s.loading);
  const error = useJobStore((s) => s.error);
  const generatingJobId = useJobStore((s) => s.generatingJobId);

  const fetchJobs = useJobStore((s) => s.fetchJobs);
  const generateDraft = useJobStore((s) => s.generateDraft);
  const archiveJob = useJobStore((s) => s.archiveJob);
  const updateJobDetails = useJobStore((s) => s.updateJobDetails);
  const fetchUpcomingInterviews = useJobStore((s) => s.fetchUpcomingInterviews);

  const [activeCard, setActiveCard] = useState("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailJob, setDetailJob] = useState(null);
  const [busyJobId, setBusyJobId] = useState(null);
  const [upcomingInterviews, setUpcomingInterviews] = useState([]);

  const cardFilterParams = useCallback(() => {
    switch (activeCard) {
      case "email_available":
        return { scope: "pending", contactFilter: "email_available" };
      case "email_not_found":
        return { scope: "pending", contactFilter: "email_not_available" };
      case "drafts_ready":
        return { scope: "pending", lifecycleStatus: "DRAFT_READY" };
      case "approved_queue":
        return { scope: "pending", lifecycleStatus: "APPROVED_QUEUE" };
      case "failed":
        return { scope: "pending", lifecycleStatus: "FAILED" };
      case "pending":
      default:
        return { scope: "pending" };
    }
  }, [activeCard]);

  const reload = useCallback(() => {
    fetchJobs({
      ...cardFilterParams(),
      search,
      sort: "newest",
      page,
      limit: 15,
    });
  }, [cardFilterParams, fetchJobs, page, search]);

  useEffect(() => {
    const timer = setTimeout(reload, 200);
    return () => clearTimeout(timer);
  }, [reload]);

  useEffect(() => {
    fetchUpcomingInterviews().then(setUpcomingInterviews);
  }, [fetchUpcomingInterviews]);

  const handleCardSelect = (cardKey) => {
    setPage(1);
    setActiveCard((prev) => (prev === cardKey && cardKey !== "pending" ? "pending" : cardKey));
  };

  const handleGenerateEmail = async (job) => {
    const app = await generateDraft(job._id, { tone: "direct" });
    if (app) {
      toast.success(`Email draft generated for ${job.companyName}.`);
      reload();
    }
  };

  const handleApproveAndQueue = async (job, sendNow = false) => {
    const ok = await confirm({
      title: sendNow ? "Send Application Email Now?" : "Approve & Queue Application?",
      message: sendNow
        ? `Approve draft and send email immediately to ${job.hrEmail}?`
        : `Approve draft for ${job.companyName} and add it to the Sending Queue?`,
      confirmLabel: sendNow ? "Send Now" : "Approve & Queue",
    });
    if (!ok) return;

    setBusyJobId(job._id);
    try {
      const { applications } = await applicationApi.list("draft");
      const draft = (applications || []).find((a) => (a.jobId?._id || a.jobId) === job._id);
      if (!draft) {
        toast.info("Open Email Drafts to review this draft first.");
        router.push("/drafts");
        return;
      }
      if (sendNow) {
        await applicationApi.sendNow(draft._id);
        toast.success(`Send request accepted for ${job.companyName}.`);
      } else {
        await applicationApi.approve(draft._id);
        toast.success(`Approved & queued ${job.companyName}.`);
      }
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyJobId(null);
    }
  };

  const handleArchive = async (job) => {
    const ok = await confirm({
      title: "Archive Vacancy?",
      message: `Archive ${job.companyName} · ${job.jobRole}? You can restore it anytime from All Vacancies.`,
      confirmLabel: "Archive",
    });
    if (!ok) return;

    const updated = await archiveJob(job._id, true);
    if (updated) {
      toast.success("Vacancy archived.");
      if (detailJob?._id === job._id) setDetailJob(null);
      reload();
    }
  };

  const cards = [
    {
      key: "pending",
      label: "Pending Vacancies",
      value: summary?.pendingVacancies ?? 0,
      icon: Clock,
      accent: "text-indigo-600",
    },
    {
      key: "email_available",
      label: "Email Available",
      value: summary?.emailAvailable ?? 0,
      icon: Mail,
      accent: "text-emerald-600",
    },
    {
      key: "email_not_found",
      label: "Email Not Found",
      value: summary?.emailNotFound ?? 0,
      icon: MailWarning,
      accent: "text-amber-600",
    },
    {
      key: "drafts_ready",
      label: "Drafts Ready for Review",
      value: summary?.draftsReady ?? 0,
      icon: FileEdit,
      accent: "text-violet-600",
    },
    {
      key: "approved_queue",
      label: "Approved / Ready to Send",
      value: summary?.approvedReadyToSend ?? 0,
      icon: Send,
      accent: "text-sky-600",
    },
    {
      key: "failed",
      label: "Failed Applications",
      value: summary?.failedApplications ?? 0,
      icon: AlertTriangle,
      accent: "text-rose-600",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Actionable vacancies only — sent applications stay in{" "}
            <Link href="/sent" className="font-medium text-indigo-600 hover:underline">
              Sent Applications
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/quick-apply"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Camera className="h-4 w-4" />
            Quick Apply (Screenshots)
          </Link>
          <Link
            href="/import"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <Upload className="h-4 w-4" />
            Manual / CSV Add
          </Link>
        </div>
      </header>

      {/* 6 Clickable Summary Cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => {
          const Icon = card.icon;
          const isSelected = activeCard === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => handleCardSelect(card.key)}
              className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? "border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-100"
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-zinc-500">{card.label}</p>
                <Icon className={`h-4 w-4 shrink-0 ${card.accent}`} />
              </div>
              <p className="mt-2.5 text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">
                {card.value}
              </p>
            </button>
          );
        })}
      </section>

      {upcomingInterviews.length > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-xs">
          <div className="flex items-center gap-2 font-medium text-indigo-950">
            <Calendar className="h-4 w-4 text-indigo-600" />
            <span>
              {upcomingInterviews.length} upcoming interview
              {upcomingInterviews.length === 1 ? "" : "s"} scheduled — next:{" "}
              <strong>{upcomingInterviews[0].companyName}</strong> ({upcomingInterviews[0].jobRole})
            </span>
          </div>
          {upcomingInterviews[0].interview?.meetingUrl ? (
            <a
              href={upcomingInterviews[0].interview.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline"
            >
              <Video className="h-3.5 w-3.5" /> Join Link
            </a>
          ) : null}
        </section>
      ) : null}

      {/* Quick Action Search Bar */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Quick search pending vacancies by company, role, email, or location…"
            className="w-full rounded-lg border border-zinc-200 py-1.5 pl-9 pr-3 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-indigo-400"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>
            Filter:{" "}
            <strong className="text-zinc-800">
              {cards.find((c) => c.key === activeCard)?.label}
            </strong>
          </span>
          <Link
            href="/pending"
            className="rounded-lg border border-zinc-200 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Advanced Filters →
          </Link>
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {/* Pending Actionable Vacancies Table */}
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Company &amp; Role</th>
                <th className="px-4 py-3">Recruitment Contact</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3 text-right">Next Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading && jobs.length === 0 ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="h-4 w-3/4 rounded bg-zinc-100" />
                    </td>
                  </tr>
                ))
              ) : null}

              {!loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-2.5">
                      <span className="rounded-full bg-emerald-50 p-3 text-emerald-600">
                        <Inbox className="h-6 w-6" />
                      </span>
                      <p className="text-sm font-medium text-zinc-800">
                        {activeCard === "pending"
                          ? "All caught up — no pending vacancies require action!"
                          : "No pending vacancies match this filter."}
                      </p>
                      <p className="max-w-sm text-xs text-zinc-500">
                        Add a new job using Quick Apply or Manual/CSV entry, or inspect completed
                        history in All Vacancies.
                      </p>
                      <div className="mt-1 flex gap-2">
                        <Link
                          href="/import"
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                        >
                          Add Vacancy
                        </Link>
                        <Link
                          href="/sent"
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          View Sent Applications
                        </Link>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null}

              {jobs.map((job) => {
                const lifecycle = job.lifecycleStatus || "IMPORTED";
                const canGenerate =
                  job.applicationType === "email" &&
                  [
                    "CONTACT_AVAILABLE",
                    "IMPORTED",
                    "SEND_FAILED",
                    "EMAIL_GENERATION_FAILED",
                  ].includes(lifecycle);
                const hasDraft = ["EMAIL_DRAFT_READY", "AWAITING_APPROVAL"].includes(lifecycle);

                return (
                  <tr key={job._id} className="hover:bg-zinc-50/70">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">{job.companyName}</p>
                      <p className="text-xs text-zinc-600">{job.jobRole}</p>
                      {job.location ? (
                        <p className="mt-0.5 text-[11px] text-zinc-400">{job.location}</p>
                      ) : null}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <ContactStatusBadge status={job.contactStatus} />
                        {job.hrEmail ? (
                          <span className="text-xs text-zinc-700">{job.hrEmail}</span>
                        ) : job.applyUrl ? (
                          <a
                            href={job.applyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-cyan-700 hover:underline"
                          >
                            Portal link <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-amber-700">HR Email Not Found</span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <MatchBadge score={job.matchScore} />
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge status={lifecycle} />
                    </td>

                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {formatDate(job.createdAt)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailJob(job)}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Details
                        </button>

                        {!job.hrEmail ? (
                          <button
                            type="button"
                            onClick={() => setDetailJob(job)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                          >
                            <Search className="h-3.5 w-3.5" />
                            Find HR Email
                          </button>
                        ) : null}

                        {canGenerate ? (
                          <button
                            type="button"
                            onClick={() => handleGenerateEmail(job)}
                            disabled={generatingJobId === job._id}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
                          >
                            {generatingJobId === job._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" />
                            )}
                            Generate Email
                          </button>
                        ) : null}

                        {hasDraft ? (
                          <>
                            <Link
                              href="/drafts"
                              className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
                            >
                              <FileEdit className="h-3.5 w-3.5" />
                              Review Draft
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleApproveAndQueue(job, false)}
                              disabled={busyJobId === job._id}
                              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApproveAndQueue(job, true)}
                              disabled={busyJobId === job._id}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Send
                            </button>
                          </>
                        ) : null}

                        {lifecycle === "APPROVED" || lifecycle === "QUEUED" ? (
                          <Link
                            href="/queue"
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                          >
                            <Send className="h-3.5 w-3.5" />
                            Send / Queue
                          </Link>
                        ) : null}

                        {lifecycle === "PORTAL_APPLICATION_REQUIRED" && job.applyUrl ? (
                          <a
                            href={job.applyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-medium text-cyan-800 hover:bg-cyan-100"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Apply Portal
                          </a>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => handleArchive(job)}
                          title="Archive vacancy"
                          className="rounded-lg border border-zinc-200 p-1.5 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {total > 15 ? (
          <footer className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs text-zinc-600">
            <span>
              Showing {jobs.length} of {total} pending · Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2.5 py-1 hover:bg-zinc-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2.5 py-1 hover:bg-zinc-50 disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </footer>
        ) : null}
      </section>

      <VacancyDetailModal
        key={detailJob?._id || "closed"}
        job={detailJob}
        onClose={() => setDetailJob(null)}
        onSave={async (id, patch) => {
          const updated = await updateJobDetails(id, patch);
          setDetailJob(updated);
          reload();
        }}
        onGenerateDraft={handleGenerateEmail}
        onArchive={handleArchive}
      />
    </div>
  );
}
