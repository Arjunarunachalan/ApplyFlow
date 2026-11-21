"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCheck,
  FileText,
  Inbox,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { StatusBadge } from "@/components/Badges";
import { applicationApi, errorMessage, jobApi } from "@/lib/api";
import { useApplicationStore } from "@/store/useApplicationStore";
import { useJobStore } from "@/store/useJobStore";

const TABS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "queued", label: "Queued" },
  { value: "sent", label: "Sent" },
  { value: "followup", label: "Needs Follow-Up" },
  { value: "failed", label: "Failed" },
];

const TONES = [
  { value: "direct", label: "Direct" },
  { value: "enthusiastic", label: "Enthusiastic" },
  { value: "founder", label: "Founder" },
];

const OUTCOMES = [
  { value: "replied", label: "Mark Replied" },
  { value: "interview", label: "Mark Interview" },
  { value: "rejected", label: "Mark Rejected" },
];

const wordCount = (text) =>
  String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const formatDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const isEditable = (application) =>
  application && ["draft", "failed"].includes(application.status);

const isDueForFollowUp = (application) =>
  application?.status === "sent" &&
  application.followUpDate &&
  new Date(application.followUpDate) <= new Date();

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

export default function ApplicationsPage() {
  const applications = useApplicationStore((state) => state.applications);
  const quota = useApplicationStore((state) => state.quota);
  const statusFilter = useApplicationStore((state) => state.statusFilter);
  const loading = useApplicationStore((state) => state.loading);
  const error = useApplicationStore((state) => state.error);
  const setStatusFilter = useApplicationStore((state) => state.setStatusFilter);
  const fetchApplications = useApplicationStore((state) => state.fetchApplications);

  const resumes = useJobStore((state) => state.resumes);
  const fetchResumes = useJobStore((state) => state.fetchResumes);

  const [selectedId, setSelectedId] = useState(null);
  const [checkedIds, setCheckedIds] = useState([]);
  const [form, setForm] = useState({ subject: "", body: "", resumeId: "" });
  const [tone, setTone] = useState("direct");
  const [customNote, setCustomNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [approvingBatch, setApprovingBatch] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Schedule interview modal state
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [schedulingApp, setSchedulingApp] = useState(null);
  const [interviewForm, setInterviewForm] = useState({ date: "", meetingUrl: "", round: "", notes: "" });
  const [schedulingInterview, setSchedulingInterview] = useState(false);

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications, statusFilter]);

  useEffect(() => {
    setCheckedIds([]);
  }, [statusFilter]);

  const selected = useMemo(
    () => applications.find((item) => item._id === selectedId) || null,
    [applications, selectedId],
  );

  const editable = isEditable(selected);
  const bodyWords = wordCount(form.body);

  const sentToday = quota?.sentToday ?? 0;
  const dailyLimit = quota?.dailyLimit ?? 30;
  const remaining = quota?.remaining ?? Math.max(0, dailyLimit - sentToday);
  const percent = dailyLimit ? Math.min(100, Math.round((sentToday / dailyLimit) * 100)) : 0;

  const selectable = useMemo(
    () => applications.filter((application) => isEditable(application)),
    [applications],
  );
  const allChecked =
    selectable.length > 0 && selectable.every((application) => checkedIds.includes(application._id));

  const openApplication = (application) => {
    setSelectedId(application._id);
    setForm({
      subject: application.subject || "",
      body: application.body || "",
      resumeId: application.resumeId?._id || "",
    });
    setTone("direct");
    setCustomNote("");
    setActionError(null);
    setNotice(null);
  };

  const closeDrawer = () => {
    setSelectedId(null);
    setActionError(null);
    setNotice(null);
  };

  const openScheduleInterview = (application) => {
    setSchedulingApp(application);
    setInterviewForm({
      date: application.jobId?.interview?.date
        ? new Date(application.jobId.interview.date).toISOString().slice(0, 16)
        : "",
      meetingUrl: application.jobId?.interview?.meetingUrl || "",
      round: application.jobId?.interview?.round || "",
      notes: application.jobId?.interview?.notes || "",
    });
    setInterviewOpen(true);
  };

  const closeScheduleInterview = () => {
    setInterviewOpen(false);
    setSchedulingApp(null);
    setNotice(null);
  };

  const handleScheduleInterview = async () => {
    if (!schedulingApp?.jobId?._id) return;
    setSchedulingInterview(true);
    setNotice(null);
    const parsed = new Date(interviewForm.date);
    const interview = {
      date: isNaN(parsed.getTime()) ? undefined : parsed,
      meetingUrl: interviewForm.meetingUrl,
      round: interviewForm.round,
      notes: interviewForm.notes,
    };
    try {
      const updated = await jobApi.setInterview(schedulingApp.jobId._id, interview);
      setSchedulingInterview(false);
      closeScheduleInterview();
      setNotice(`Interview scheduled for ${updated.interview?.date ? new Date(updated.interview.date).toLocaleDateString() : "—"}.`);
      fetchApplications();
    } catch (err) {
      setSchedulingInterview(false);
      setActionError(errorMessage(err));
    }
  };

  const toggleChecked = (id) =>
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );

  const toggleAllChecked = () =>
    setCheckedIds(allChecked ? [] : selectable.map((application) => application._id));

  const saveDraft = async () => {
    if (!selected) return;
    setSaving(true);
    setActionError(null);
    setNotice(null);
    try {
      await applicationApi.update(selected._id, {
        subject: form.subject,
        body: form.body,
        ...(form.resumeId ? { resumeId: form.resumeId } : {}),
      });
      await fetchApplications();
      setNotice("Draft saved.");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (!selected?.jobId?._id) {
      setActionError("The job for this application no longer exists.");
      return;
    }
    setRegenerating(true);
    setActionError(null);
    setNotice(null);
    try {
      const application = await applicationApi.generate(selected.jobId._id, {
        ...(form.resumeId ? { resumeId: form.resumeId } : {}),
        tone,
        customNote,
      });
      await fetchApplications();
      setForm({
        subject: application.subject || "",
        body: application.body || "",
        resumeId: application.resumeId?._id || form.resumeId,
      });
      setNotice(
        `Regenerated with the ${tone} tone${
          application.providerUsed && application.providerUsed !== "template"
            ? ` (${application.providerUsed})`
            : ""
        }. Save or approve when it reads right.`,
      );
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setRegenerating(false);
    }
  };

  const approve = async () => {
    if (!selected) return;
    setApproving(true);
    setActionError(null);
    setNotice(null);
    try {
      await applicationApi.approve(selected._id);
      await fetchApplications();
      setNotice("Approved — queued for the worker, which sends with a human-like delay.");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setApproving(false);
    }
  };

  const sendImmediately = async () => {
    if (!selected) return;
    setSendingNow(true);
    setActionError(null);
    setNotice(null);
    try {
      await applicationApi.sendNow(selected._id);
      await fetchApplications();
      closeDrawer();
      setNotice("Application sent successfully! Email dispatched with attached resume.");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSendingNow(false);
    }
  };

  const handleSendNowRow = async (id) => {
    setBusyId(id);
    setActionError(null);
    setNotice(null);
    try {
      await applicationApi.sendNow(id);
      await fetchApplications();
      setNotice("Application sent successfully! Email dispatched with attached resume.");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleProcessQueue = async () => {
    setProcessingQueue(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await applicationApi.processQueue();
      await fetchApplications();
      setNotice(result.message || "Queue processed successfully!");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setProcessingQueue(false);
    }
  };

  const approveSelected = async () => {
    if (!checkedIds.length) return;
    setApprovingBatch(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await applicationApi.approveBatch(checkedIds);
      await fetchApplications();
      setCheckedIds([]);
      setNotice(
        `Queued ${result.queued} application${result.queued === 1 ? "" : "s"}` +
          (result.skipped ? ` · ${result.skipped} skipped` : "") +
          (result.stoppedByQuota ? " · stopped at the daily limit" : "") +
          `. ${result.remainingQuota} send${result.remainingQuota === 1 ? "" : "s"} left.`,
      );
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setApprovingBatch(false);
    }
  };

  const retry = async (application) => {
    setBusyId(application._id);
    setActionError(null);
    setNotice(null);
    try {
      await applicationApi.approve(application._id);
      await fetchApplications();
      setNotice("Retry queued.");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const generateFollowUp = async (application) => {
    setBusyId(application._id);
    setActionError(null);
    setNotice(null);
    try {
      await applicationApi.generateFollowUp(application._id);
      await fetchApplications();
      setNotice("Follow-up draft created — open the Draft tab to review it.");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const markOutcome = async (status) => {
    if (!selected) return;
    setBusyId(selected._id);
    setActionError(null);
    setNotice(null);
    try {
      await applicationApi.setStatus(selected._id, status);
      await fetchApplications();
      closeDrawer();
      setNotice(`Marked ${status}.`);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Applications</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Review AI drafts, edit them, then approve a send. Nothing leaves without you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchApplications()}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-700">Daily sending quota</p>
            <p className="mt-1 text-xs text-zinc-500">
              {sentToday} of {dailyLimit} sent in the last 24 hours · {remaining} remaining
              {quota?.queued ? ` · ${quota.queued} queued` : ""}
            </p>
          </div>
          <span className="text-sm font-semibold text-zinc-900">{percent}%</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full rounded-full transition-all ${
              percent >= 100 ? "bg-rose-500" : "bg-indigo-500"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
          {TABS.map((tab) => {
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {tab.label}
                {tab.value === "followup" ? (
                  <CalendarClock className="h-3.5 w-3.5" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {applications.length ? (
            <p className="text-xs text-zinc-500">{applications.length} shown</p>
          ) : null}
          {statusFilter === "queued" && applications.length > 0 ? (
            <button
              type="button"
              onClick={handleProcessQueue}
              disabled={processingQueue}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {processingQueue ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send All Queued Now ({applications.length})
            </button>
          ) : null}
          {checkedIds.length ? (
            <button
              type="button"
              onClick={approveSelected}
              disabled={approvingBatch || remaining === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {approvingBatch ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Approve &amp; Queue Selected ({checkedIds.length})
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {actionError && !selected ? (
        <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {actionError}
        </p>
      ) : null}

      {notice && !selected ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAllChecked}
                    disabled={selectable.length === 0}
                    aria-label="Select all drafts"
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400"
                  />
                </th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Resume</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading && applications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-zinc-500">
                    Loading applications…
                  </td>
                </tr>
              ) : null}

              {!loading && applications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <span className="rounded-full bg-zinc-100 p-3 text-zinc-400">
                        <Inbox className="h-6 w-6" />
                      </span>
                      <p className="text-sm font-medium text-zinc-700">
                        {statusFilter === "draft"
                          ? "No drafts waiting for review"
                          : statusFilter === "queued"
                          ? "No applications in the queue"
                          : statusFilter === "sent"
                          ? "No sent applications yet"
                          : statusFilter === "followup"
                          ? "No follow-ups due right now"
                          : statusFilter === "failed"
                          ? "No failed applications"
                          : "No applications found"}
                      </p>
                      <p className="max-w-sm text-sm text-zinc-500">
                        {statusFilter === "draft"
                          ? "Generate drafts or use Auto-Apply from the Jobs page to craft personalized applications."
                          : statusFilter === "queued"
                          ? "Approve drafts from the Draft tab to place them in the queue, or use Auto-Apply from Jobs."
                          : statusFilter === "sent"
                          ? "Applications you send will show up here with delivery timestamps and follow-up tracking."
                          : statusFilter === "followup"
                          ? "Applications with no response after 5 days will surface here automatically."
                          : statusFilter === "failed"
                          ? "Any bounced or rejected sends will appear here with error logs."
                          : "Start applying from the Jobs dashboard to populate your pipeline."}
                      </p>
                      <Link
                        href="/"
                        className="mt-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Go to jobs
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : null}

              {applications.map((application) => {
                const job = application.jobId;
                const canCheck = isEditable(application);
                const due = isDueForFollowUp(application);
                return (
                  <tr key={application._id} className="hover:bg-zinc-50/70">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checkedIds.includes(application._id)}
                        onChange={() => toggleChecked(application._id)}
                        disabled={!canCheck}
                        aria-label={`Select ${job?.companyName || "application"}`}
                        className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400 disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">
                        {job?.companyName || "Job removed"}
                      </p>
                      <p className="text-xs text-zinc-500">{job?.jobRole || "—"}</p>
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <span className="break-all text-zinc-600">
                        {application.recipientEmail || job?.hrEmail || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-indigo-500" />
                        {application.resumeId?.title || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={application.status} />
                        {application.isFollowUp ? (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                            follow-up
                          </span>
                        ) : null}
                        {due ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                            <CalendarClock className="h-3 w-3" />
                            due
                          </span>
                        ) : null}
                        {application.status === "replied" && application.replySnippet ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-inset ring-teal-200">
                            <CheckCheck className="h-3 w-3" />
                            Replied
                          </span>
                        ) : null}
                      </div>
                      {application.status === "replied" && application.replySnippet ? (
                        <p className="mt-1 flex max-w-[16rem] items-center gap-1 text-xs text-teal-700">
                          <FileText className="h-3 w-3 shrink-0" />
                          {application.replySnippet}
                        </p>
                      ) : null}
                      {application.repliedAt ? (
                        <p className="mt-0.5 text-[11px] text-zinc-400">
                          Replied {formatDate(application.repliedAt)}
                        </p>
                      ) : null}
                      {application.status === "failed" && application.errorLog ? (
                        <span
                          title={application.errorLog}
                          className="mt-1 flex max-w-[16rem] items-center gap-1 truncate text-xs text-red-700"
                        >
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {application.errorLog}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {formatDate(
                        application.status === "sent" ? application.sentAt : application.updatedAt,
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {application.status === "queued" ? (
                          <button
                            type="button"
                            onClick={() => handleSendNowRow(application._id)}
                            disabled={busyId === application._id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {busyId === application._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            Send Now
                          </button>
                        ) : null}

                        {application.status === "failed" ? (
                          <button
                            type="button"
                            onClick={() => retry(application)}
                            disabled={busyId === application._id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busyId === application._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Retry
                          </button>
                        ) : null}

                        {due ? (
                          <button
                            type="button"
                            onClick={() => generateFollowUp(application)}
                            disabled={busyId === application._id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busyId === application._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CalendarClock className="h-3.5 w-3.5" />
                            )}
                            Follow-Up
                          </button>
                        ) : null}

                        {application.status === "sent" || application.status === "replied" ? (
                          <button
                            type="button"
                            onClick={() => openScheduleInterview(application)}
                            disabled={busyId === application._id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                          >
                            {busyId === application._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Video className="h-3.5 w-3.5" />
                            )}
                            Schedule Interview
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => openApplication(application)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                        >
                          {isEditable(application) ? (
                            <>
                              <Sparkles className="h-3.5 w-3.5" />
                              Review
                            </>
                          ) : (
                            <>
                              <Send className="h-3.5 w-3.5" />
                              View
                            </>
                          )}
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

      {selected ? (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-zinc-900/40"
            onClick={closeDrawer}
            role="presentation"
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-y-auto bg-white shadow-xl">
            <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  {editable ? "Draft review" : "Application"}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-900">
                  {selected.jobId?.companyName || "Job removed"}
                </h2>
                <p className="text-sm text-zinc-500">
                  {selected.jobId?.jobRole || "—"} ·{" "}
                  {selected.recipientEmail || selected.jobId?.hrEmail || "no recipient"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                    {selected.providerUsed === "gemini" || selected.providerUsed === "ollama"
                      ? `AI: ${selected.providerUsed}`
                      : "Template draft"}
                  </span>
                  {selected.isFollowUp ? (
                    <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                      Follow-up
                    </span>
                  ) : null}
                  {selected.jobId?.matchScore !== undefined ? (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                      {selected.jobId.matchScore}% match
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-lg border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50"
                aria-label="Close draft"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex flex-1 flex-col gap-4 px-5 py-5">
              {actionError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {actionError}
                </p>
              ) : null}

              {notice ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {notice}
                </p>
              ) : null}

              {editable ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-zinc-600">Tone</span>
                      <select
                        value={tone}
                        onChange={(event) => setTone(event.target.value)}
                        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-700 shadow-sm outline-none focus:border-indigo-400"
                      >
                        {TONES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                      <span className="text-xs font-medium text-zinc-600">
                        Custom note (optional)
                      </span>
                      <input
                        value={customNote}
                        onChange={(event) => setCustomNote(event.target.value)}
                        placeholder="e.g. mention I can join immediately"
                        className={inputClass}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={regenerate}
                      disabled={regenerating || saving || approving}
                      className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {regenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      Regenerate with AI
                    </button>
                  </div>
                </div>
              ) : null}

              {selected.status === "sent" ? (
                <div className="rounded-lg border border-zinc-200 bg-white p-3">
                  <p className="text-xs font-medium text-zinc-600">Reply tracking</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {OUTCOMES.map((outcome) => (
                      <button
                        key={outcome.value}
                        type="button"
                        onClick={() => markOutcome(outcome.value)}
                        disabled={busyId === selected._id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        {outcome.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => generateFollowUp(selected)}
                    disabled={busyId === selected._id}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-60"
                  >
                    {busyId === selected._id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CalendarClock className="h-3.5 w-3.5" />
                    )}
                    Generate Follow-Up
                  </button>
                </div>
              ) : null}

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-zinc-600">Subject</span>
                <input
                  value={form.subject}
                  onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
                  readOnly={!editable}
                  className={`${inputClass} ${editable ? "" : "bg-zinc-50 text-zinc-600"}`}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="flex items-center justify-between text-xs font-medium text-zinc-600">
                  Body
                  <span
                    className={
                      bodyWords >= 120 && bodyWords <= 160
                        ? "text-emerald-600"
                        : "text-zinc-400"
                    }
                  >
                    {bodyWords} words
                  </span>
                </span>
                <textarea
                  value={form.body}
                  onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
                  readOnly={!editable}
                  rows={14}
                  className={`${inputClass} font-mono text-[13px] leading-relaxed ${
                    editable ? "" : "bg-zinc-50 text-zinc-600"
                  }`}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-zinc-600">Attached resume</span>
                <select
                  value={form.resumeId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, resumeId: event.target.value }))
                  }
                  disabled={!editable || resumes.length === 0}
                  className={`${inputClass} ${editable ? "" : "bg-zinc-50 text-zinc-600"}`}
                >
                  {form.resumeId ? null : <option value="">No resume selected</option>}
                  {resumes.map((resume) => (
                    <option key={resume._id} value={resume._id}>
                      {resume.title}
                      {resume.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
                {resumes.length === 0 ? (
                  <span className="text-xs text-zinc-400">
                    No resumes uploaded yet — add one on the{" "}
                    <Link href="/resumes" className="text-indigo-600 hover:underline">
                      Resumes
                    </Link>{" "}
                    page.
                  </span>
                ) : null}
              </label>

              {selected.followUpDate ? (
                <p className="text-xs text-zinc-500">
                  Follow-up {isDueForFollowUp(selected) ? "due" : "scheduled"} for{" "}
                  {formatDate(selected.followUpDate)}
                </p>
              ) : null}

              {selected.status === "failed" && selected.errorLog ? (
                <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {selected.errorLog}
                </p>
              ) : null}
            </div>

            <footer className="border-t border-zinc-200 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-500">
                  {remaining} send{remaining === 1 ? "" : "s"} left today
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveDraft}
                    disabled={!editable || saving || approving || sendingNow || regenerating}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={sendImmediately}
                    disabled={!editable || saving || approving || sendingNow || regenerating}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                  >
                    {sendingNow ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send Now
                  </button>
                  <button
                    type="button"
                    onClick={approve}
                    disabled={!editable || saving || approving || sendingNow || regenerating}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                  >
                    {approving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Approve &amp; Queue
                  </button>
                </div>
              </div>
            </footer>
          </aside>
        </div>
      ) : null}

      {/* Schedule Interview modal */}
      {interviewOpen && schedulingApp && (
        <>
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
                      {schedulingApp.jobId?.companyName} · {schedulingApp.jobId?.jobRole}
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
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
