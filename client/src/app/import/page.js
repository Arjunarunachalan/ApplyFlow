"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Download,
  FileEdit,
  FileText,
  Loader2,
  PlusCircle,
  Send,
  Sparkles,
  Upload,
} from "lucide-react";
import { useJobStore } from "@/store/useJobStore";
import { useApplicationStore } from "@/store/useApplicationStore";
import { errorMessage } from "@/lib/api";

const TONES = [
  { value: "direct", label: "Direct" },
  { value: "enthusiastic", label: "Enthusiastic" },
  { value: "founder", label: "Founder" },
];

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const initialManualForm = {
  companyName: "",
  jobRole: "",
  hrEmail: "",
  applyUrl: "",
  location: "",
  companyWebsite: "",
  salary: "",
  jobDescription: "",
  resumeId: "",
  tone: "direct",
  customNote: "",
};

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  // Tab state: "manual" or "csv"
  const [activeTab, setActiveTab] = useState("manual");

  // CSV State
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const importing = useJobStore((state) => state.importing);
  const csvError = useJobStore((state) => state.error);
  const lastImport = useJobStore((state) => state.lastImport);
  const importCsv = useJobStore((state) => state.importCsv);

  // Manual Entry State
  const [manualForm, setManualForm] = useState(initialManualForm);
  const [submittingMode, setSubmittingMode] = useState(null);
  const [manualError, setManualError] = useState(null);
  const [manualSuccess, setManualSuccess] = useState(null);

  const resumes = useJobStore((state) => state.resumes);
  const fetchResumes = useJobStore((state) => state.fetchResumes);
  const createJob = useJobStore((state) => state.createJob);

  const quota = useApplicationStore((state) => state.quota);
  const fetchApplications = useApplicationStore((state) => state.fetchApplications);

  useEffect(() => {
    fetchResumes();
    fetchApplications();
  }, [fetchResumes, fetchApplications]);

  // Set default resume once resumes load
  useEffect(() => {
    if (resumes.length > 0 && !manualForm.resumeId) {
      const def = resumes.find((r) => r.isDefault) || resumes[0];
      if (def) {
        setManualForm((prev) => ({ ...prev, resumeId: def._id }));
      }
    }
  }, [resumes, manualForm.resumeId]);

  const defaultResumeId = useMemo(() => {
    const def = resumes.find((r) => r.isDefault) || resumes[0];
    return def?._id || "";
  }, [resumes]);

  const remainingQuota = quota?.remaining ?? 30;
  const hasEmail = Boolean(manualForm.hrEmail.trim());

  // Manual action handlers
  const handleSaveOnly = async (e) => {
    e.preventDefault();
    if (!manualForm.companyName.trim() || !manualForm.jobRole.trim()) {
      setManualError("Company Name and Job Role are required.");
      return;
    }
    setSubmittingMode("save_only");
    setManualError(null);
    setManualSuccess(null);
    try {
      const result = await createJob({
        ...manualForm,
        mode: "save_only",
      });
      const job = result?.job || result;
      setManualSuccess(
        `${job.companyName} · ${job.jobRole} saved successfully (Match score: ${job.matchScore ?? 0}%). Ready for batch applying, or add another below.`
      );
      setManualForm({
        ...initialManualForm,
        resumeId: defaultResumeId,
      });
    } catch (err) {
      setManualError(errorMessage(err));
    } finally {
      setSubmittingMode(null);
    }
  };

  const handleGenerateDraft = async (e) => {
    e.preventDefault();
    if (!manualForm.companyName.trim() || !manualForm.jobRole.trim()) {
      setManualError("Company Name and Job Role are required.");
      return;
    }
    if (!hasEmail) {
      setManualError("An HR / Careers email is required to generate an email application draft.");
      return;
    }
    setSubmittingMode("generate_draft");
    setManualError(null);
    setManualSuccess(null);
    try {
      await createJob({
        ...manualForm,
        mode: "generate_draft",
      });
      router.push("/applications");
    } catch (err) {
      setManualError(errorMessage(err));
      setSubmittingMode(null);
    }
  };

  const handleAutoQueue = async (e) => {
    e.preventDefault();
    if (!manualForm.companyName.trim() || !manualForm.jobRole.trim()) {
      setManualError("Company Name and Job Role are required.");
      return;
    }
    if (!hasEmail) {
      setManualError("An HR / Careers email is required to auto-apply and queue.");
      return;
    }
    if (remainingQuota <= 0) {
      setManualError("Daily sending limit reached. Raise your limit in Profile or try again later.");
      return;
    }
    setSubmittingMode("auto_queue");
    setManualError(null);
    setManualSuccess(null);
    try {
      const result = await createJob({
        ...manualForm,
        mode: "auto_queue",
      });
      const comp = result?.job?.companyName || manualForm.companyName;
      setManualSuccess(
        `Auto-applied and queued for ${comp}! Grounded personalized email draft is ready in your queue.`
      );
      setManualForm({
        ...initialManualForm,
        resumeId: defaultResumeId,
      });
      fetchApplications();
    } catch (err) {
      setManualError(errorMessage(err));
    } finally {
      setSubmittingMode(null);
    }
  };

  // CSV Drag and drop handlers
  const chooseFile = (selected) => {
    if (!selected) return;
    setFile(selected);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  };

  const onCsvSubmit = async (event) => {
    event.preventDefault();
    if (!file) return;
    await importCsv(file);
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Add / Import Jobs</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Paste a single vacancy directly from job portals, or bulk upload hundreds via CSV.
        </p>
      </header>

      {/* Tab Switcher */}
      <div className="flex border-b border-zinc-200">
        <button
          type="button"
          onClick={() => setActiveTab("manual")}
          className={`inline-flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
            activeTab === "manual"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
          }`}
        >
          <FileEdit className="h-4 w-4" />
          Manual Entry (Single Vacancy)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("csv")}
          className={`inline-flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
            activeTab === "csv"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
          }`}
        >
          <Upload className="h-4 w-4" />
          CSV Bulk Upload
        </button>
      </div>

      {/* TAB 1: MANUAL ENTRY */}
      {activeTab === "manual" && (
        <div className="flex flex-col gap-5">
          <form className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            {manualError ? (
              <p className="mb-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {manualError}
              </p>
            ) : null}

            {manualSuccess ? (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {manualSuccess}
                </span>
                <Link href="/" className="font-medium underline hover:text-emerald-950">
                  View in Jobs →
                </Link>
              </div>
            ) : null}

            {/* Essential Fields Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-zinc-700">
                  Company Name <span className="text-rose-500">*</span>
                </span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corp"
                  value={manualForm.companyName}
                  onChange={(e) =>
                    setManualForm((prev) => ({ ...prev, companyName: e.target.value }))
                  }
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-zinc-700">
                  Job Role <span className="text-rose-500">*</span>
                </span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Frontend Engineer"
                  value={manualForm.jobRole}
                  onChange={(e) =>
                    setManualForm((prev) => ({ ...prev, jobRole: e.target.value }))
                  }
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-zinc-700">HR / Careers Email</span>
                <input
                  type="email"
                  placeholder="e.g. hr@acme.com or careers@acme.com"
                  value={manualForm.hrEmail}
                  onChange={(e) =>
                    setManualForm((prev) => ({ ...prev, hrEmail: e.target.value }))
                  }
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-zinc-700">Apply URL (Optional)</span>
                <input
                  type="url"
                  placeholder="https://acme.com/jobs/123"
                  value={manualForm.applyUrl}
                  onChange={(e) =>
                    setManualForm((prev) => ({ ...prev, applyUrl: e.target.value }))
                  }
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-zinc-700">Location</span>
                <input
                  type="text"
                  placeholder="e.g. Remote / Bangalore / Chennai"
                  value={manualForm.location}
                  onChange={(e) =>
                    setManualForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-zinc-700">Salary / Compensation</span>
                <input
                  type="text"
                  placeholder="e.g. ₹15–20 LPA / $120,000"
                  value={manualForm.salary}
                  onChange={(e) =>
                    setManualForm((prev) => ({ ...prev, salary: e.target.value }))
                  }
                  className={inputClass}
                />
              </label>
            </div>

            {/* Job Description Textarea */}
            <div className="mt-4 flex flex-col gap-1.5">
              <label className="flex items-center justify-between text-xs font-medium text-zinc-700">
                <span>
                  Job Description <span className="text-rose-500">*</span>
                </span>
                <span className="text-xs font-normal text-zinc-400">
                  Copy-paste directly from LinkedIn, Indeed, Naukri, or email
                </span>
              </label>
              <textarea
                required
                rows={6}
                placeholder="Paste the full job description, requirements, and responsibilities here. Our AI scans this against your real resume projects to calculate match score and craft fact-grounded application emails..."
                value={manualForm.jobDescription}
                onChange={(e) =>
                  setManualForm((prev) => ({ ...prev, jobDescription: e.target.value }))
                }
                className={`${inputClass} font-mono text-xs leading-relaxed`}
              />
            </div>

            {/* Personalization Options */}
            <div className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-900">
                AI Personalization Settings
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-700">Attached Resume</span>
                  <select
                    value={manualForm.resumeId}
                    onChange={(e) =>
                      setManualForm((prev) => ({ ...prev, resumeId: e.target.value }))
                    }
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 shadow-sm outline-none focus:border-indigo-400"
                  >
                    {resumes.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.title} {r.isDefault ? "(Default)" : ""}
                      </option>
                    ))}
                    {resumes.length === 0 ? (
                      <option value="">No resumes found — upload on Resumes page</option>
                    ) : null}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-700">Writing Tone</span>
                  <select
                    value={manualForm.tone}
                    onChange={(e) =>
                      setManualForm((prev) => ({ ...prev, tone: e.target.value }))
                    }
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 shadow-sm outline-none focus:border-indigo-400"
                  >
                    {TONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-700">Custom Note</span>
                  <input
                    type="text"
                    placeholder="e.g. Immediate joiner, notice period 15 days"
                    value={manualForm.customNote}
                    onChange={(e) =>
                      setManualForm((prev) => ({ ...prev, customNote: e.target.value }))
                    }
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 shadow-sm outline-none focus:border-indigo-400 placeholder:text-zinc-400"
                  />
                </label>
              </div>
            </div>

            {/* Smart Action Buttons */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-5">
              <div className="text-xs text-zinc-500">
                {hasEmail ? (
                  <span className="text-emerald-700 font-medium">
                    ✓ Valid HR email provided — ready for AI draft or auto-queue
                  </span>
                ) : (
                  <span className="text-amber-700">
                    ℹ HR email missing — this will be saved as a portal job
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* 1. Save Only */}
                <button
                  type="button"
                  onClick={handleSaveOnly}
                  disabled={Boolean(submittingMode)}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submittingMode === "save_only" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlusCircle className="h-4 w-4 text-zinc-500" />
                  )}
                  Save to Queue
                </button>

                {/* 2. Save & Review AI Draft */}
                <button
                  type="button"
                  onClick={handleGenerateDraft}
                  disabled={Boolean(submittingMode) || !hasEmail}
                  className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title={hasEmail ? "" : "Requires HR Email"}
                >
                  {submittingMode === "generate_draft" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Save &amp; Review AI Draft
                </button>

                {/* 3. Save & Auto-Apply Now */}
                <div className="flex flex-col items-end">
                  <button
                    type="button"
                    onClick={handleAutoQueue}
                    disabled={Boolean(submittingMode) || !hasEmail || remainingQuota <= 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    title={hasEmail ? "" : "Requires HR Email"}
                  >
                    {submittingMode === "auto_queue" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Save &amp; Auto-Apply Now
                  </button>
                  <span className="mt-1 text-[11px] text-zinc-400">
                    Uses 1 of {remainingQuota} remaining daily quota
                  </span>
                </div>
              </div>
            </div>
          </form>

          {/* Quick Tips */}
          <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
            <h3 className="font-semibold text-zinc-800">Pro-Tips for Manual Entry:</h3>
            <ul className="mt-1.5 list-disc space-inside list-inside space-y-1">
              <li>
                <strong>Save to Queue:</strong> Adds the job with automated skill scoring without creating drafts immediately. Use this to quickly add 3–5 vacancies in a row, then use &quot;Batch Auto-Apply&quot; from the Jobs dashboard.
              </li>
              <li>
                <strong>Save &amp; Review AI Draft:</strong> Immediately crafts an email strictly grounded in your uploaded resume and takes you to the Applications page to review or edit.
              </li>
              <li>
                <strong>Save &amp; Auto-Apply Now:</strong> Generates the personalized email and queues it for dispatch without requiring manual review.
              </li>
            </ul>
          </section>
        </div>
      )}

      {/* TAB 2: CSV BULK UPLOAD */}
      {activeTab === "csv" && (
        <div className="flex flex-col gap-6">
          <form
            onSubmit={onCsvSubmit}
            className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                dragging
                  ? "border-indigo-400 bg-indigo-50/60"
                  : "border-zinc-200 bg-zinc-50/60"
              }`}
            >
              <span className="rounded-full bg-white p-3 text-indigo-600 shadow-sm">
                <Upload className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-800">
                  Drag and drop your .csv here
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  or pick a file from your computer (max 5 MB)
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => chooseFile(event.target.files?.[0])}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              >
                Choose file
              </button>

              {file ? (
                <p className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs text-zinc-600 shadow-sm">
                  <FileText className="h-3.5 w-3.5 text-indigo-500" />
                  {file.name}
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <a
                href="/sample-jobs.csv"
                download="sample-jobs.csv"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <Download className="h-4 w-4" />
                Download Sample CSV
              </a>

              <button
                type="submit"
                disabled={!file || importing}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {importing ? "Importing…" : "Import jobs"}
              </button>
            </div>

            {csvError ? (
              <p className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {csvError}
              </p>
            ) : null}
          </form>

          {lastImport ? (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />
                <h2 className="text-sm font-semibold">Import finished</h2>
              </div>

              <dl className="mt-4 grid gap-3 sm:grid-cols-4">
                {[
                  ["Imported", lastImport.imported],
                  ["Skipped duplicates", lastImport.skippedDuplicates],
                  ["Invalid rows", lastImport.invalidRows],
                  ["Total processed", lastImport.totalProcessed],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-white px-4 py-3 shadow-sm">
                    <dt className="text-xs font-medium text-zinc-500">{label}</dt>
                    <dd className="mt-1 text-2xl font-semibold text-zinc-900">{value}</dd>
                  </div>
                ))}
              </dl>

              <Link
                href="/"
                className="mt-4 inline-flex text-sm font-medium text-emerald-800 hover:underline"
              >
                View imported jobs →
              </Link>
            </section>
          ) : null}

          <section className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Expected columns</h2>
            <p className="mt-2 leading-relaxed">
              <code className="rounded bg-zinc-100 px-1">Company Name</code>,{" "}
              <code className="rounded bg-zinc-100 px-1">Job Role</code>,{" "}
              <code className="rounded bg-zinc-100 px-1">HR Email</code>,{" "}
              <code className="rounded bg-zinc-100 px-1">Apply URL</code>,{" "}
              <code className="rounded bg-zinc-100 px-1">Job Description</code>,{" "}
              <code className="rounded bg-zinc-100 px-1">Location</code>,{" "}
              <code className="rounded bg-zinc-100 px-1">Company Website</code>,{" "}
              <code className="rounded bg-zinc-100 px-1">Salary</code>,{" "}
              <code className="rounded bg-zinc-100 px-1">Email Source</code>
            </p>
            <p className="mt-3 text-xs text-zinc-500">
              Rows with a valid HR email become email applications. Rows without one need an apply URL
              to become portal applications; rows with neither are counted as invalid.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
