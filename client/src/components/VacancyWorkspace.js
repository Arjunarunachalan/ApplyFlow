"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Filter,
  Inbox,
  Loader2,
  Mail,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  ContactStatusBadge,
  MatchBadge,
  StatusBadge,
  TypeBadge,
} from "@/components/Badges";
import { useConfirm, useToast } from "@/components/ToastProvider";
import VacancyDetailModal from "@/components/VacancyDetailModal";
import { applicationApi, errorMessage } from "@/lib/api";
import { useJobStore } from "@/store/useJobStore";

const DATE_PRESETS = [
  { value: "", label: "All Dates" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "custom", label: "Custom Range" },
];

const CONTACT_FILTERS = [
  { value: "all", label: "All Contacts" },
  { value: "email_available", label: "Email Available" },
  { value: "email_not_available", label: "Email Not Available" },
  { value: "requires_verification", label: "Contact Requires Verification" },
  { value: "verified", label: "Verified Public Source" },
];

const LIFECYCLE_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "PENDING", label: "Pending (All Actionable)" },
  { value: "CONTACT_DISCOVERY", label: "Contact Discovery Pending" },
  { value: "CONTACT_AVAILABLE", label: "Draft Not Generated (Email Ready)" },
  { value: "CONTACT_NOT_FOUND", label: "HR Email Not Found" },
  { value: "EMAIL_DRAFT_READY", label: "Draft Ready" },
  { value: "AWAITING_APPROVAL", label: "Awaiting Approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "QUEUED", label: "Queued / Sending" },
  { value: "SENT", label: "Sent" },
  { value: "FAILED", label: "Failed" },
  { value: "NEEDS_REVIEW", label: "Needs Review" },
  { value: "PORTAL_APPLICATION_REQUIRED", label: "Portal Application Required" },
  { value: "ARCHIVED", label: "Archived" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "company_asc", label: "Company Name A–Z" },
  { value: "company_desc", label: "Company Name Z–A" },
  { value: "role_asc", label: "Job Title A–Z" },
  { value: "updated_desc", label: "Recently Updated" },
  { value: "priority_desc", label: "Highest Priority" },
];

const DEFAULT_QUERY = {
  search: "",
  contactFilter: "all",
  lifecycleStatus: "all",
  dateField: "createdAt",
  datePreset: "",
  dateFrom: "",
  dateTo: "",
  company: "",
  jobTitle: "",
  location: "",
  experience: "",
  workArrangement: "all",
  sourcePlatform: "",
  importType: "all",
  resumeId: "all",
  sort: "newest",
  page: 1,
  limit: 25,
};

const selectClass =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const inputClass =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 shadow-sm outline-none placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

function VacancyWorkspaceInner({
  scope = "pending",
  title = "Pending Vacancies",
  description = "Vacancies still requiring contact discovery, drafting, approval, or portal action.",
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();

  const jobs = useJobStore((s) => s.jobs);
  const total = useJobStore((s) => s.total);
  const totalPages = useJobStore((s) => s.totalPages);
  const loading = useJobStore((s) => s.loading);
  const error = useJobStore((s) => s.error);
  const resumes = useJobStore((s) => s.resumes);
  const fetchJobs = useJobStore((s) => s.fetchJobs);
  const fetchResumes = useJobStore((s) => s.fetchResumes);
  const deleteJob = useJobStore((s) => s.deleteJob);
  const archiveJob = useJobStore((s) => s.archiveJob);
  const updateJobDetails = useJobStore((s) => s.updateJobDetails);
  const generateDraft = useJobStore((s) => s.generateDraft);
  const generateDrafts = useJobStore((s) => s.generateDrafts);
  const generatingJobId = useJobStore((s) => s.generatingJobId);
  const bulkDrafting = useJobStore((s) => s.bulkDrafting);

  const initialFromUrl = useMemo(() => {
    const next = { ...DEFAULT_QUERY };
    for (const key of Object.keys(DEFAULT_QUERY)) {
      const val = searchParams.get(key);
      if (val !== null) {
        next[key] = key === "page" || key === "limit" ? Number(val) || DEFAULT_QUERY[key] : val;
      }
    }
    return next;
  }, [searchParams]);

  const [query, setQuery] = useState(initialFromUrl);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [detailJob, setDetailJob] = useState(null);
  const [busyActionId, setBusyActionId] = useState(null);

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

  // Sync URL query cleanly whenever filter state changes
  const syncUrl = useCallback(
    (nextQuery) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(nextQuery)) {
        if (v !== DEFAULT_QUERY[k] && v !== "" && v !== undefined) {
          params.set(k, String(v));
        }
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const updateQuery = (patch) => {
    setQuery((prev) => {
      const next = {
        ...prev,
        ...patch,
        page: patch.page !== undefined ? patch.page : 1,
      };
      syncUrl(next);
      return next;
    });
  };

  const clearFilters = () => {
    setQuery(DEFAULT_QUERY);
    router.replace(pathname, { scroll: false });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchJobs({ ...query, scope });
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchJobs, query, scope]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const [k, v] of Object.entries(query)) {
      if (k === "page" || k === "limit" || k === "sort" || k === "dateField") continue;
      if (v !== DEFAULT_QUERY[k] && v !== "") count += 1;
    }
    return count;
  }, [query]);

  const emailEligible = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.applicationType === "email" &&
          j.hrEmail &&
          !["SENT", "QUEUED", "SENDING", "ARCHIVED"].includes(j.lifecycleStatus),
      ),
    [jobs],
  );

  const allChecked =
    emailEligible.length > 0 && emailEligible.every((j) => selectedIds.includes(j._id));

  const toggleSelect = (id) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );

  const toggleSelectAll = () =>
    setSelectedIds(allChecked ? [] : emailEligible.map((j) => j._id));

  const handleGenerate = async (job) => {
    const app = await generateDraft(job._id, { tone: "direct" });
    if (app) {
      toast.success(`Draft created for ${job.companyName}. Review in Email Drafts.`);
      fetchJobs({ ...query, scope });
    }
  };

  const handleBulkDrafts = async () => {
    if (!selectedIds.length) return;
    const res = await generateDrafts(selectedIds, "direct");
    if (res) {
      toast.success(
        `Generated ${res.generated} draft(s)${res.skipped ? `, ${res.skipped} skipped` : ""}.`,
      );
      setSelectedIds([]);
      fetchJobs({ ...query, scope });
    }
  };

  const handleQuickApproveAndQueue = async (job) => {
    const ok = await confirm({
      title: "Approve & Queue Application?",
      message: `This will approve the draft for ${job.companyName} (${job.jobRole}) and place it into the Sending Queue.`,
      confirmLabel: "Approve & Queue",
    });
    if (!ok) return;

    setBusyActionId(job._id);
    try {
      const listRes = await applicationApi.list("draft");
      const draft = (listRes.applications || []).find(
        (a) => (a.jobId?._id || a.jobId) === job._id,
      );
      if (!draft) {
        toast.info("Open Email Drafts to review or generate the draft first.");
        router.push("/drafts");
        return;
      }
      await applicationApi.approve(draft._id);
      toast.success(`Approved & queued email to ${job.companyName}.`);
      fetchJobs({ ...query, scope });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyActionId(null);
    }
  };

  const handleArchive = async (job, archived = true) => {
    const ok = await confirm({
      title: archived ? "Archive Vacancy?" : "Restore Vacancy?",
      message: archived
        ? `Archive ${job.companyName} · ${job.jobRole}? It will be hidden from Pending views.`
        : `Restore ${job.companyName} · ${job.jobRole} back to active pipeline?`,
      confirmLabel: archived ? "Archive" : "Restore",
    });
    if (!ok) return;

    const updated = await archiveJob(job._id, archived);
    if (updated) {
      toast.success(archived ? "Vacancy archived." : "Vacancy restored.");
      if (detailJob?._id === job._id) setDetailJob(null);
      fetchJobs({ ...query, scope });
    }
  };

  const handleDelete = async (job) => {
    const ok = await confirm({
      title: "Delete Vacancy Permanently?",
      message: `Delete ${job.companyName} · ${job.jobRole}? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    const removed = await deleteJob(job._id);
    if (removed) {
      toast.success("Vacancy deleted.");
      fetchJobs({ ...query, scope });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/quick-apply"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Sparkles className="h-4 w-4" />
            Quick Apply
          </Link>
          <Link
            href="/import"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            Manual / CSV Add
          </Link>
        </div>
      </header>

      {/* Search + Primary Filters + Sort Bar */}
      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={query.search}
              onChange={(e) => updateQuery({ search: e.target.value })}
              placeholder="Search company, job title, HR email, location…"
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-xs text-zinc-800 shadow-sm outline-none placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <select
            value={query.contactFilter}
            onChange={(e) => updateQuery({ contactFilter: e.target.value })}
            className={selectClass}
            aria-label="Contact availability filter"
          >
            {CONTACT_FILTERS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={query.lifecycleStatus}
            onChange={(e) => updateQuery({ lifecycleStatus: e.target.value })}
            className={selectClass}
            aria-label="Application status filter"
          >
            {LIFECYCLE_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={query.datePreset}
            onChange={(e) => updateQuery({ datePreset: e.target.value })}
            className={selectClass}
            aria-label="Date preset filter"
          >
            {DATE_PRESETS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={query.sort}
            onChange={(e) => updateQuery({ sort: e.target.value })}
            className={selectClass}
            aria-label="Sort vacancies"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm ${
              showAdvanced
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            More Filters
          </button>

          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              <X className="h-3.5 w-3.5" />
              Clear ({activeFilterCount})
            </button>
          ) : null}
        </div>

        {/* Custom date range & Date field selector */}
        {(query.datePreset === "custom" || query.datePreset) && (
          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3 text-xs">
            <label className="flex items-center gap-2 font-medium text-zinc-600">
              Date Field:
              <select
                value={query.dateField}
                onChange={(e) => updateQuery({ dateField: e.target.value })}
                className={selectClass}
              >
                <option value="createdAt">Vacancy Creation / Import Date (Default)</option>
                <option value="jobPostedAt">Original Job-Posting Date</option>
              </select>
            </label>

            {query.datePreset === "custom" ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-zinc-600">
                  From:
                  <input
                    type="date"
                    value={query.dateFrom}
                    onChange={(e) => updateQuery({ dateFrom: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="flex items-center gap-1.5 text-zinc-600">
                  To:
                  <input
                    type="date"
                    value={query.dateTo}
                    onChange={(e) => updateQuery({ dateTo: e.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>
            ) : null}
          </div>
        )}

        {/* Advanced multi-field filters */}
        {showAdvanced ? (
          <div className="grid gap-2.5 border-t border-zinc-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              value={query.company}
              onChange={(e) => updateQuery({ company: e.target.value })}
              placeholder="Filter by company…"
              className={inputClass}
            />
            <input
              value={query.jobTitle}
              onChange={(e) => updateQuery({ jobTitle: e.target.value })}
              placeholder="Filter by job title…"
              className={inputClass}
            />
            <input
              value={query.location}
              onChange={(e) => updateQuery({ location: e.target.value })}
              placeholder="Filter by location…"
              className={inputClass}
            />
            <input
              value={query.experience}
              onChange={(e) => updateQuery({ experience: e.target.value })}
              placeholder="Filter by experience (e.g. 2 years)…"
              className={inputClass}
            />
            <select
              value={query.workArrangement}
              onChange={(e) => updateQuery({ workArrangement: e.target.value })}
              className={selectClass}
            >
              <option value="all">Work Arrangement: All</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="office">Office</option>
              <option value="unspecified">Unspecified</option>
            </select>
            <input
              value={query.sourcePlatform}
              onChange={(e) => updateQuery({ sourcePlatform: e.target.value })}
              placeholder="Source platform (linkedin, naukri…)"
              className={inputClass}
            />
            <select
              value={query.importType}
              onChange={(e) => updateQuery({ importType: e.target.value })}
              className={selectClass}
            >
              <option value="all">Import Type: All</option>
              <option value="screenshot">Screenshot</option>
              <option value="csv">CSV</option>
              <option value="xlsx">Excel (XLSX)</option>
              <option value="manual">Manual Entry</option>
            </select>
            <select
              value={query.resumeId}
              onChange={(e) => updateQuery({ resumeId: e.target.value })}
              className={selectClass}
            >
              <option value="all">Resume Profile: All</option>
              {resumes.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {/* Bulk action bar (safe draft generation by default) */}
      {selectedIds.length > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm">
          <p className="text-sm font-medium text-indigo-900">
            {selectedIds.length} email-eligible vacanc{selectedIds.length === 1 ? "y" : "ies"} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBulkDrafts}
              disabled={bulkDrafting}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {bulkDrafting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Generate Email Drafts ({selectedIds.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="rounded-lg border border-indigo-200 bg-white px-2.5 py-2 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
            >
              Clear
            </button>
          </div>
        </section>
      ) : null}

      {/* Table */}
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleSelectAll}
                    disabled={emailEligible.length === 0}
                    aria-label="Select all email vacancies"
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400"
                  />
                </th>
                <th className="px-4 py-3">Company &amp; Role</th>
                <th className="px-4 py-3">Contact Status</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Lifecycle</th>
                <th className="px-4 py-3">Imported</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading && jobs.length === 0 ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="h-4 w-3/4 rounded bg-zinc-100" />
                    </td>
                  </tr>
                ))
              ) : null}

              {!loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-2.5">
                      <span className="rounded-full bg-zinc-100 p-3 text-zinc-400">
                        <Inbox className="h-6 w-6" />
                      </span>
                      <p className="text-sm font-medium text-zinc-700">No vacancies match this view</p>
                      <p className="max-w-sm text-xs text-zinc-500">
                        {activeFilterCount > 0
                          ? "Try clearing filters or switching date presets."
                          : "Add a vacancy via Quick Apply or CSV/Manual Import to begin."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}

              {jobs.map((job) => {
                const lifecycle = job.lifecycleStatus || "IMPORTED";
                const isSelectable =
                  job.applicationType === "email" &&
                  job.hrEmail &&
                  !["SENT", "QUEUED", "SENDING", "ARCHIVED"].includes(lifecycle);

                return (
                  <tr key={job._id} className="hover:bg-zinc-50/70">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(job._id)}
                        onChange={() => toggleSelect(job._id)}
                        disabled={!isSelectable}
                        className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400 disabled:opacity-40"
                      />
                    </td>
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
                          <span className="text-xs text-zinc-600">{job.hrEmail}</span>
                        ) : job.applyUrl ? (
                          <a
                            href={job.applyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-cyan-700 hover:underline"
                          >
                            Portal Link <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-amber-700">HR Email Not Found</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <MatchBadge score={job.matchScore} />
                        <TypeBadge type={job.applicationType} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={lifecycle} />
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      <p>
                        {new Date(job.createdAt).toLocaleDateString(undefined, {
                          day: "2-digit",
                          month: "short",
                        })}
                      </p>
                      <p className="text-[11px] uppercase text-zinc-400">
                        {job.importType || "manual"}
                      </p>
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

                        {/* Contextual status actions */}
                        {!job.hrEmail && lifecycle !== "ARCHIVED" && lifecycle !== "SENT" ? (
                          <button
                            type="button"
                            onClick={() => setDetailJob(job)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                          >
                            <Search className="h-3.5 w-3.5" />
                            Find HR Email
                          </button>
                        ) : null}

                        {job.applicationType === "email" &&
                        ["CONTACT_AVAILABLE", "IMPORTED", "SEND_FAILED", "EMAIL_GENERATION_FAILED"].includes(
                          lifecycle,
                        ) ? (
                          <button
                            type="button"
                            onClick={() => handleGenerate(job)}
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

                        {["EMAIL_DRAFT_READY", "AWAITING_APPROVAL"].includes(lifecycle) ? (
                          <>
                            <Link
                              href="/drafts"
                              className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Review Draft
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleQuickApproveAndQueue(job)}
                              disabled={busyActionId === job._id}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {busyActionId === job._id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              Approve
                            </button>
                          </>
                        ) : null}

                        {lifecycle === "APPROVED" || lifecycle === "QUEUED" ? (
                          <Link
                            href="/queue"
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                          >
                            <Send className="h-3.5 w-3.5" />
                            View Queue
                          </Link>
                        ) : null}

                        {lifecycle !== "ARCHIVED" && lifecycle !== "SENT" ? (
                          <button
                            type="button"
                            onClick={() => handleArchive(job, true)}
                            title="Archive vacancy"
                            className="rounded-lg border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        ) : lifecycle === "ARCHIVED" ? (
                          <button
                            type="button"
                            onClick={() => handleArchive(job, false)}
                            title="Restore vacancy"
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Restore
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => handleDelete(job)}
                          title="Delete vacancy"
                          className="rounded-lg border border-zinc-200 p-1.5 text-zinc-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/70 px-4 py-3 text-xs text-zinc-600">
          <p>
            Showing <span className="font-medium text-zinc-900">{jobs.length}</span> of{" "}
            <span className="font-medium text-zinc-900">{total}</span> vacancies · Page{" "}
            {query.page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <select
              value={query.limit}
              onChange={(e) => updateQuery({ limit: Number(e.target.value), page: 1 })}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
            >
              <option value={15}>15 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
            <button
              type="button"
              disabled={query.page <= 1}
              onClick={() => updateQuery({ page: Math.max(1, query.page - 1) })}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              type="button"
              disabled={query.page >= totalPages}
              onClick={() => updateQuery({ page: Math.min(totalPages, query.page + 1) })}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </footer>
      </section>

      <VacancyDetailModal
        key={detailJob?._id || "closed"}
        job={detailJob}
        onClose={() => setDetailJob(null)}
        onSave={async (id, patch) => {
          const updated = await updateJobDetails(id, patch);
          setDetailJob(updated);
          fetchJobs({ ...query, scope });
        }}
        onGenerateDraft={handleGenerate}
        onArchive={handleArchive}
      />
    </div>
  );
}

export default function VacancyWorkspace(props) {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
          Loading vacancies…
        </div>
      }
    >
      <VacancyWorkspaceInner {...props} />
    </Suspense>
  );
}
