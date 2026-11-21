"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Calendar,
  CheckCheck,
  ExternalLink,
  Inbox,
  Loader2,
  Lock,
  Mail,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import { MatchBadge, StatusBadge, TypeBadge } from "@/components/Badges";
import { useJobStore } from "@/store/useJobStore";

const STATUS_OPTIONS = [
  "new",
  "draft_ready",
  "approved",
  "queued",
  "sent",
  "replied",
  "interview",
  "rejected",
  "failed",
];

const TONES = [
  { value: "direct", label: "Direct" },
  { value: "enthusiastic", label: "Enthusiastic" },
  { value: "founder", label: "Founder" },
];

const inputClass =
  "rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const selectClass =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

// Only a job that can still get a first draft is worth selecting.
const isSelectable = (job) =>
  job.applicationType === "email" &&
  Boolean(job.hrEmail) &&
  !["queued", "sent"].includes(job.status);

export default function JobsDashboard() {
  const jobs = useJobStore((state) => state.jobs);
  const loading = useJobStore((state) => state.loading);
  const error = useJobStore((state) => state.error);
  const filters = useJobStore((state) => state.filters);
  const setFilter = useJobStore((state) => state.setFilter);
  const fetchJobs = useJobStore((state) => state.fetchJobs);
  const deleteJob = useJobStore((state) => state.deleteJob);
  const generatingJobId = useJobStore((state) => state.generatingJobId);
  const applyingJobId = useJobStore((state) => state.applyingJobId);
  const generateDraft = useJobStore((state) => state.generateDraft);
  const autoApply = useJobStore((state) => state.autoApply);
  const bulkDrafting = useJobStore((state) => state.bulkDrafting);
  const bulkApplying = useJobStore((state) => state.bulkApplying);
  const bulkProgress = useJobStore((state) => state.bulkProgress);
  const generateDrafts = useJobStore((state) => state.generateDrafts);
  const autoApplyBatch = useJobStore((state) => state.autoApplyBatch);
  const markJobStatus = useJobStore((state) => state.markJobStatus);
  const createJob = useJobStore((state) => state.createJob);
  const setInterview = useJobStore((state) => state.setInterview);
  const fetchUpcomingInterviews = useJobStore((state) => state.fetchUpcomingInterviews);
  const syncReplies = useJobStore((state) => state.syncReplies);
  const router = useRouter();

  const [selectedIds, setSelectedIds] = useState([]);
  const [tone, setTone] = useState("direct");
  const [notice, setNotice] = useState(null);

  // + Add Job modal state
  const [addJobOpen, setAddJobOpen] = useState(false);
  const [newJob, setNewJob] = useState({
    companyName: "",
    jobRole: "",
    hrEmail: "",
    applyUrl: "",
    jobDescription: "",
    location: "",
    companyWebsite: "",
    salary: "",
  });
  const [addingJob, setAddingJob] = useState(false);

  // Interview scheduling state
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [schedulingJob, setSchedulingJob] = useState(null);
  const [interviewForm, setInterviewForm] = useState({
    date: "",
    meetingUrl: "",
    round: "",
    notes: "",
  });
  const [schedulingInterview, setSchedulingInterview] = useState(false);

  // Sync replies state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const selectableJobs = useMemo(() => jobs.filter(isSelectable), [jobs]);
  const allSelected =
    selectableJobs.length > 0 &&
    selectableJobs.every((job) => selectedIds.includes(job._id));

  const onGenerate = async (job) => {
    const application = await generateDraft(job._id, { tone });
    if (application) router.push("/applications");
  };

  const onAutoApply = async (job) => {
    setNotice(null);
    const result = await autoApply(job._id, { tone });
    if (result?.application) {
      setNotice(`Auto-applied to ${job.companyName}! Email dispatched with your attached resume.`);
      fetchJobs();
    }
  };

  const onBulkAutoApply = async () => {
    setNotice(null);
    const result = await autoApplyBatch(selectedIds, tone);
    if (!result) return;
    setNotice(
      `Auto-applied to ${result.applied} job${result.applied === 1 ? "" : "s"}` +
        (result.skipped ? ` · ${result.skipped} skipped` : "") +
        (result.failed ? ` · ${result.failed} failed` : "") +
        ". Review them on the Applications Sent tab.",
    );
    setSelectedIds([]);
  };

  const toggleJob = (id) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );

  const toggleAll = () =>
    setSelectedIds(allSelected ? [] : selectableJobs.map((job) => job._id));

  // Add Job handlers
  const openAddJob = () => {
    setNewJob({
      companyName: "",
      jobRole: "",
      hrEmail: "",
      applyUrl: "",
      jobDescription: "",
      location: "",
      companyWebsite: "",
      salary: "",
    });
    setAddJobOpen(true);
  };

  const closeAddJob = () => {
    setAddJobOpen(false);
    setNewJob({
      companyName: "",
      jobRole: "",
      hrEmail: "",
      applyUrl: "",
      jobDescription: "",
      location: "",
      companyWebsite: "",
      salary: "",
    });
    setNotice(null);
  };

  const handleAddJob = async () => {
    setAddingJob(true);
    setNotice(null);
    const created = await createJob(newJob);
    setAddingJob(false);
    if (created) {
      setAddJobOpen(false);
      setNotice(`${created.companyName} · ${created.jobRole} added.`);
      fetchJobs();
    }
  };

  // Interview scheduling handlers
  const openScheduleInterview = (job) => {
    setSchedulingJob(job);
    setInterviewForm({
      date: job.interview?.date ? new Date(job.interview.date).toISOString().slice(0, 16) : "",
      meetingUrl: job.interview?.meetingUrl || "",
      round: job.interview?.round || "",
      notes: job.interview?.notes || "",
    });
    setInterviewOpen(true);
  };

  const closeScheduleInterview = () => {
    setInterviewOpen(false);
    setSchedulingJob(null);
    setNotice(null);
  };

  const handleScheduleInterview = async () => {
    if (!schedulingJob) return;
    setSchedulingInterview(true);
    setNotice(null);
    const parsed = new Date(interviewForm.date);
    const interview = {
      date: isNaN(parsed.getTime()) ? undefined : parsed,
      meetingUrl: interviewForm.meetingUrl,
      round: interviewForm.round,
      notes: interviewForm.notes,
    };
    const updated = await setInterview(schedulingJob._id, interview);
    setSchedulingInterview(false);
    if (updated) {
      closeScheduleInterview();
      setUpcomingInterviews((prev) =>
        prev.filter((j) => j._id !== updated._id).concat(updated).sort((a, b) =>
          new Date(a.interview.date) - new Date(b.interview.date),
        ),
      );
      fetchJobs();
    }
  };

  // Sync replies handler
  const handleSyncReplies = async () => {
    setSyncing(true);
    setSyncResult(null);
    setNotice(null);
    const result = await syncReplies();
    setSyncing(false);
    setSyncResult(result);
    if (result.error) {
      setNotice(`Sync failed: ${result.error}`);
    } else if (result.repliesFound || result.bouncesFound) {
      const parts = [];
      if (result.repliesFound) parts.push(`${result.repliesFound} reply${result.repliesFound > 1 ? "es" : ""}`);
      if (result.bouncesFound) parts.push(`${result.bouncesFound} bounce${result.bouncesFound > 1 ? "s" : ""}`);
      setNotice(`Sync complete: ${result.checked} checked · ${parts.join(" · ")} found.`);
      fetchJobs();
    } else {
      setNotice(`Sync complete: ${result.checked} checked · no new replies or bounces.`);
    }
  };

  const onBulkGenerate = async () => {
    setNotice(null);
    const result = await generateDrafts(selectedIds, tone);
    if (!result) return;
    setNotice(
      `${result.generated} personalized draft${result.generated === 1 ? "" : "s"} generated` +
        (result.skipped ? ` · ${result.skipped} skipped` : "") +
        (result.failed ? ` · ${result.failed} failed` : "") +
        ". Review them on the Applications page.",
    );
    setSelectedIds([]);
  };

  const [upcomingInterviews, setUpcomingInterviews] = useState([]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchJobs();
    }, 250);
    return () => clearTimeout(timeout);
  }, [filters.search, filters.type, filters.status, fetchJobs]);

  // Load upcoming interviews once on mount
  useEffect(() => {
    fetchUpcomingInterviews().then(setUpcomingInterviews);
  }, [fetchUpcomingInterviews]);

  const total = jobs.length;
  const emailJobs = jobs.filter((job) => job.applicationType === "email").length;
  const portalJobs = jobs.filter((job) => job.applicationType === "portal").length;
  const sentJobs = jobs.filter((job) => job.status === "sent").length;
  const selectedCount = selectedIds.length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Jobs</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Every imported lead, scored against your profile and classified as an email or
            portal application.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncReplies}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-60"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            {syncing ? "Syncing…" : "Sync Replies"}
          </button>
          {syncResult && (syncResult.repliesFound || syncResult.bouncesFound) && (
            <p className="text-xs text-emerald-700">
              {syncResult.repliesFound} reply(s) · {syncResult.bouncesFound} bounce(s) found
            </p>
          )}
          <button
            type="button"
            onClick={openAddJob}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            <Send className="h-4 w-4" />
            + Add Job
          </button>
          <Link
            href="/import"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Link>
        </div>
      </header>

      {upcomingInterviews.length > 0 && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-indigo-900">Upcoming Interviews</h2>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingInterviews.map((job) => (
              <div
                key={job._id}
                className="rounded-lg border border-indigo-100 bg-white p-3 shadow-sm"
              >
                <p className="font-medium text-zinc-900">{job.companyName}</p>
                <p className="text-xs text-zinc-500">{job.jobRole}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-indigo-700">
                  <Video className="h-3.5 w-3.5" />
                  <span className="font-medium">{job.interview?.round || "Interview"}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-600">
                  {job.interview?.date
                    ? new Date(job.interview.date).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })
                    : "—"}
                </p>
                {job.interview?.meetingUrl && (
                  <a
                    href={job.interview.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                  >
                    Join meeting
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => openScheduleInterview(job)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                >
                  Edit interview
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Jobs" value={total} icon={Briefcase} />
        <StatCard label="Email Applications" value={emailJobs} icon={Mail} accent="text-indigo-600" />
        <StatCard label="Portal Applications" value={portalJobs} icon={ExternalLink} accent="text-cyan-600" />
        <StatCard label="Sent" value={sentJobs} icon={Send} accent="text-emerald-600" />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={filters.search}
            onChange={(event) => setFilter({ search: event.target.value })}
            placeholder="Search company, role, email…"
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-800 shadow-sm outline-none placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <select
          value={filters.type}
          onChange={(event) => setFilter({ type: event.target.value })}
          className={selectClass}
        >
          <option value="all">All types</option>
          <option value="email">Email</option>
          <option value="portal">Portal</option>
        </select>

        <select
          value={filters.status}
          onChange={(event) => setFilter({ status: event.target.value })}
          className={selectClass}
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </section>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {selectedCount > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm">
          <p className="text-sm font-medium text-indigo-900">
            {selectedCount} job{selectedCount === 1 ? "" : "s"} selected
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium text-indigo-900">
              Tone
              <select
                value={tone}
                onChange={(event) => setTone(event.target.value)}
                disabled={bulkDrafting}
                className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 shadow-sm outline-none focus:border-indigo-400"
              >
                {TONES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={onBulkAutoApply}
              disabled={bulkApplying || bulkDrafting}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {bulkApplying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {bulkApplying
                ? `Auto-Applying ${selectedCount}…`
                : `Auto-Apply Selected (${selectedCount})`}
            </button>

            <button
              type="button"
              onClick={onBulkGenerate}
              disabled={bulkDrafting || bulkApplying}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkDrafting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {bulkDrafting
                ? `Drafting ${bulkProgress?.total ?? selectedCount}…`
                : `Generate Drafts (${selectedCount})`}
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              disabled={bulkDrafting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-2 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={selectableJobs.length === 0}
                    aria-label="Select all email jobs"
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400"
                  />
                </th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-zinc-500">
                    Loading jobs…
                  </td>
                </tr>
              ) : null}

              {!loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <span className="rounded-full bg-zinc-100 p-3 text-zinc-400">
                        <Inbox className="h-6 w-6" />
                      </span>
                      <p className="text-sm font-medium text-zinc-700">No jobs yet</p>
                      <p className="max-w-sm text-sm text-zinc-500">
                        Import a CSV of job leads to see them scored and classified here.
                      </p>
                      <Link
                        href="/import"
                        className="mt-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Import your first CSV
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : null}

              {jobs.map((job) => {
                const selectable = isSelectable(job);
                return (
                  <tr key={job._id} className="hover:bg-zinc-50/70">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(job._id)}
                        onChange={() => toggleJob(job._id)}
                        disabled={!selectable}
                        aria-label={`Select ${job.companyName}`}
                        className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400 disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">{job.companyName}</p>
                      {job.location ? (
                        <p className="text-xs text-zinc-500">{job.location}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{job.jobRole}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <MatchBadge score={job.matchScore} />
                        {job.matchedSkills?.length ? (
                          <div className="flex max-w-[12rem] flex-wrap gap-1">
                            {job.matchedSkills.slice(0, 3).map((skill) => (
                              <span
                                key={skill}
                                className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600"
                              >
                                {skill}
                              </span>
                            ))}
                            {job.matchedSkills.length > 3 ? (
                              <span className="text-[11px] text-zinc-400">
                                +{job.matchedSkills.length - 3}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={job.applicationType} />
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      {job.hrEmail ? (
                        <a
                          href={`mailto:${job.hrEmail}`}
                          className="break-all text-indigo-600 hover:underline"
                        >
                          {job.hrEmail}
                        </a>
                      ) : job.applyUrl ? (
                        <a
                          href={job.applyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 break-all text-cyan-700 hover:underline"
                        >
                          Apply link
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {job.applicationType === "email" &&
                        !["queued", "sent", "replied", "interview", "rejected"].includes(
                          job.status,
                        ) ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onAutoApply(job)}
                              disabled={
                                applyingJobId === job._id ||
                                generatingJobId === job._id ||
                                bulkApplying ||
                                bulkDrafting
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                            >
                              {applyingJobId === job._id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              Auto-Apply
                            </button>

                            <button
                              type="button"
                              onClick={() => onGenerate(job)}
                              disabled={
                                generatingJobId === job._id ||
                                applyingJobId === job._id ||
                                bulkDrafting ||
                                bulkApplying
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {generatingJobId === job._id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                              )}
                              {job.status === "draft_ready" ? "Regenerate" : "Draft"}
                            </button>
                          </>
                        ) : null}

                        {job.applicationType === "email" && job.status === "draft_ready" ? (
                          <Link
                            href="/applications"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Review Draft
                          </Link>
                        ) : null}

                        {job.applicationType === "portal" && job.applyUrl ? (
                          <a
                            href={job.applyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-cyan-700 transition-colors hover:bg-cyan-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open Portal
                          </a>
                        ) : null}

                        {job.applicationType === "portal" && job.status === "new" ? (
                          <button
                            type="button"
                            onClick={() => markJobStatus(job._id, "sent")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Mark Applied
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => deleteJob(job._id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* + Add Job Modal */}
      {addJobOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-zinc-900/40"
            onClick={closeAddJob}
            role="presentation"
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-zinc-900">Add a Job</h2>
                <button
                  type="button"
                  onClick={closeAddJob}
                  className="rounded-lg border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col gap-4 px-5 py-5">
                {notice && !addJobOpen && (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {notice}
                  </p>
                )
                  ? null
                  : notice
                    ? (
                      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        {notice}
                      </p>
                    )
                    : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-zinc-600">Company name *</span>
                    <input
                      type="text"
                      value={newJob.companyName}
                      onChange={(e) =>
                        setNewJob((prev) => ({ ...prev, companyName: e.target.value }))
                      }
                      placeholder="Acme Corp"
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-zinc-600">Job role *</span>
                    <input
                      type="text"
                      value={newJob.jobRole}
                      onChange={(e) =>
                        setNewJob((prev) => ({ ...prev, jobRole: e.target.value }))
                      }
                      placeholder="Frontend Engineer"
                      className={inputClass}
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-zinc-600">HR email</span>
                    <input
                      type="email"
                      value={newJob.hrEmail}
                      onChange={(e) =>
                        setNewJob((prev) => ({ ...prev, hrEmail: e.target.value }))
                      }
                      placeholder="hr@acme.com"
                      className={`${inputClass} text-zinc-800`}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-zinc-600">Apply URL</span>
                    <input
                      type="url"
                      value={newJob.applyUrl}
                      onChange={(e) =>
                        setNewJob((prev) => ({ ...prev, applyUrl: e.target.value }))
                      }
                      placeholder="https://careers.acme.com/apply"
                      className={inputClass}
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-zinc-600">Job description</span>
                  <textarea
                    value={newJob.jobDescription}
                    onChange={(e) =>
                      setNewJob((prev) => ({ ...prev, jobDescription: e.target.value }))
                    }
                    placeholder="We are looking for a React developer…"
                    rows={3}
                    className={inputClass}
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-zinc-600">Location</span>
                    <input
                      type="text"
                      value={newJob.location}
                      onChange={(e) =>
                        setNewJob((prev) => ({ ...prev, location: e.target.value }))
                      }
                      placeholder="Remote"
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-zinc-600">Company website</span>
                    <input
                      type="url"
                      value={newJob.companyWebsite}
                      onChange={(e) =>
                        setNewJob((prev) => ({ ...prev, companyWebsite: e.target.value }))
                      }
                      placeholder="https://acme.com"
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-zinc-600">Salary</span>
                    <input
                      type="text"
                      value={newJob.salary}
                      onChange={(e) =>
                        setNewJob((prev) => ({ ...prev, salary: e.target.value }))
                      }
                      placeholder="$120k–150k"
                      className={inputClass}
                    />
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-4">
                  <button
                    type="button"
                    onClick={closeAddJob}
                    disabled={addingJob}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddJob}
                    disabled={addingJob || !newJob.companyName || !newJob.jobRole}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                  >
                    {addingJob ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Adding…
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Add Job
                      </>
                    )
                  }
                </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Interview Modal */}
      {interviewOpen && schedulingJob && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-zinc-900/40"
            onClick={closeScheduleInterview}
            role="presentation"
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Schedule Interview</h2>
                  <p className="text-sm text-zinc-500">
                    {schedulingJob.companyName} · {schedulingJob.jobRole}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeScheduleInterview}
                  className="rounded-lg border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col gap-4 px-5 py-5">
                <div className="grid gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-zinc-600">Interview date *</span>
                    <input
                      type="datetime-local"
                      value={interviewForm.date}
                      onChange={(e) =>
                        setInterviewForm((prev) => ({ ...prev, date: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-zinc-600">Meeting URL</span>
                    <input
                      type="url"
                      value={interviewForm.meetingUrl}
                      onChange={(e) =>
                        setInterviewForm((prev) => ({ ...prev, meetingUrl: e.target.value }))
                      }
                      placeholder="https://meet.google.com/abc-defg-hij"
                      className={inputClass}
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-zinc-600">Round</span>
                    <input
                      type="text"
                      value={interviewForm.round}
                      onChange={(e) =>
                        setInterviewForm((prev) => ({ ...prev, round: e.target.value }))
                      }
                      placeholder="Technical, Phone Screen, On-site…"
                      className={inputClass}
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-zinc-600">Notes</span>
                    <textarea
                      value={interviewForm.notes}
                      onChange={(e) =>
                        setInterviewForm((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      placeholder="React deep dive, system design…"
                      rows={3}
                      className={inputClass}
                    />
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-4">
                  <button
                    type="button"
                    onClick={closeScheduleInterview}
                    disabled={schedulingInterview}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleScheduleInterview}
                    disabled={schedulingInterview || !interviewForm.date}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                  >
                    {schedulingInterview ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Video className="h-4 w-4" />
                        Save Interview
                      </>
                    )
                  }
                </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
