"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCheck,
  Download,
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
import { useConfirm, useToast } from "@/components/ToastProvider";
import { applicationApi, errorMessage, jobApi } from "@/lib/api";
import { useApplicationStore } from "@/store/useApplicationStore";
import { useJobStore } from "@/store/useJobStore";

const TABS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "queue_view", label: "Approved & Queued" },
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
  application && ["draft", "approved", "failed"].includes(application.status);

const isDueForFollowUp = (application) =>
  application?.status === "sent" &&
  application.followUpDate &&
  new Date(application.followUpDate) <= new Date();

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

export default function ApplicationsWorkspace({
  fixedFilter = null,
  title = "Applications",
  description = "Review drafts, manage your queue, and inspect sent or failed requests.",
  showTabs = true,
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const applications = useApplicationStore((s) => s.applications);
  const quota = useApplicationStore((s) => s.quota);
  const storeFilter = useApplicationStore((s) => s.statusFilter);
  const loading = useApplicationStore((s) => s.loading);
  const error = useApplicationStore((s) => s.error);
  const setStatusFilter = useApplicationStore((s) => s.setStatusFilter);
  const fetchApplications = useApplicationStore((s) => s.fetchApplications);

  const resumes = useJobStore((s) => s.resumes);
  const fetchResumes = useJobStore((s) => s.fetchResumes);
  const syncReplies = useJobStore((s) => s.syncReplies);

  const effectiveFilter = fixedFilter || storeFilter;

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
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [interviewOpen, setInterviewOpen] = useState(false);
  const [schedulingApp, setSchedulingApp] = useState(null);
  const [interviewForm, setInterviewForm] = useState({
    date: "",
    meetingUrl: "",
    round: "",
    notes: "",
  });
  const [schedulingInterview, setSchedulingInterview] = useState(false);

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

  useEffect(() => {
    if (fixedFilter && storeFilter !== fixedFilter) {
      setStatusFilter(fixedFilter);
    }
  }, [fixedFilter, setStatusFilter, storeFilter]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications, storeFilter, effectiveFilter]);

  const selected = useMemo(
    () => applications.find((item) => item._id === selectedId) || null,
    [applications, selectedId],
  );

  const editable = isEditable(selected);
  const bodyWords = wordCount(form.body);

  const sentToday = quota?.sentToday ?? 0;
  const dailyLimit = quota?.dailyLimit ?? 20;
  const remaining = quota?.remaining ?? Math.max(0, dailyLimit - sentToday);
  const percent = dailyLimit ? Math.min(100, Math.round((sentToday / dailyLimit) * 100)) : 0;

  const selectable = useMemo(
    () => applications.filter((application) => isEditable(application)),
    [applications],
  );
  const selectableIds = useMemo(
    () => new Set(selectable.map((item) => item._id)),
    [selectable],
  );
  const visibleCheckedIds = useMemo(
    () => checkedIds.filter((id) => selectableIds.has(id)),
    [checkedIds, selectableIds],
  );
  const allChecked =
    selectable.length > 0 && visibleCheckedIds.length === selectable.length;

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
  };

  const closeDrawer = () => {
    setSelectedId(null);
    setActionError(null);
  };

  const handleScheduleInterview = async () => {
    if (!schedulingApp?.jobId?._id) return;
    setSchedulingInterview(true);
    try {
      const parsed = new Date(interviewForm.date);
      await jobApi.setInterview(schedulingApp.jobId._id, {
        date: Number.isNaN(parsed.getTime()) ? undefined : parsed,
        meetingUrl: interviewForm.meetingUrl,
        round: interviewForm.round,
        notes: interviewForm.notes,
      });
      setSchedulingInterview(false);
      setInterviewOpen(false);
      setSchedulingApp(null);
      toast.success("Interview scheduled.");
      fetchApplications();
    } catch (err) {
      setSchedulingInterview(false);
      toast.error(errorMessage(err));
    }
  };

  const saveDraft = async () => {
    if (!selected) return;
    setSaving(true);
    setActionError(null);
    try {
      await applicationApi.update(selected._id, {
        subject: form.subject,
        body: form.body,
        ...(form.resumeId ? { resumeId: form.resumeId } : {}),
      });
      await fetchApplications();
      toast.success("Draft saved.");
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
      toast.success(`Regenerated with ${tone} tone.`);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setRegenerating(false);
    }
  };

  const approveOnly = async () => {
    if (!selected) return;
    setApproving(true);
    setActionError(null);
    try {
      await applicationApi.approveOnly(selected._id);
      await fetchApplications();
      toast.success("Draft approved. Ready to queue or send.");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setApproving(false);
    }
  };

  const approveAndQueue = async () => {
    if (!selected) return;
    setApproving(true);
    setActionError(null);
    try {
      await applicationApi.approve(selected._id);
      await fetchApplications();
      closeDrawer();
      toast.success("Approved and added to Sending Queue.");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setApproving(false);
    }
  };

  const sendImmediately = async () => {
    if (!selected) return;
    const ok = await confirm({
      title: "Send Application Email Now?",
      message: `Send email immediately to ${selected.recipientEmail} with ${
        selected.resumeId?.fileName || "attached resume"
      }?`,
      confirmLabel: "Send Email",
    });
    if (!ok) return;

    setSendingNow(true);
    setActionError(null);
    try {
      await applicationApi.sendNow(selected._id);
      await fetchApplications();
      closeDrawer();
      toast.success("Send request accepted by mail provider.");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSendingNow(false);
    }
  };

  const approveSelected = async () => {
    if (!visibleCheckedIds.length) return;
    const ok = await confirm({
      title: "Approve & Queue Selected Drafts?",
      message: `Approve ${visibleCheckedIds.length} selected application(s) and push them to the Sending Queue?`,
      confirmLabel: "Approve & Queue Selected",
    });
    if (!ok) return;

    setApprovingBatch(true);
    setActionError(null);
    try {
      const result = await applicationApi.approveBatch(visibleCheckedIds);
      await fetchApplications();
      setCheckedIds([]);
      toast.success(
        `Queued ${result.queued} application(s)${result.skipped ? ` · ${result.skipped} skipped` : ""}.`,
      );
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setApprovingBatch(false);
    }
  };

  const handleSendNowRow = async (application) => {
    const ok = await confirm({
      title: "Send Queued Application Now?",
      message: `Dispatch email to ${application.recipientEmail} immediately?`,
      confirmLabel: "Send Now",
    });
    if (!ok) return;

    setBusyId(application._id);
    try {
      await applicationApi.sendNow(application._id);
      await fetchApplications();
      toast.success("Email send request accepted.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleProcessQueue = async () => {
    const ok = await confirm({
      title: "Send All Queued Applications Now?",
      message: `This will immediately process all ${applications.length} queued/approved applications.`,
      confirmLabel: "Send All Now",
    });
    if (!ok) return;

    setProcessingQueue(true);
    try {
      const result = await applicationApi.processQueue();
      await fetchApplications();
      toast.success(result.message || "Queue processed.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setProcessingQueue(false);
    }
  };

  const retry = async (application) => {
    const ok = await confirm({
      title: "Retry Failed Application?",
      message: `Re-queue application to ${application.recipientEmail}?`,
      confirmLabel: "Retry",
    });
    if (!ok) return;

    setBusyId(application._id);
    try {
      await applicationApi.approve(application._id);
      await fetchApplications();
      toast.success("Application moved back to Sending Queue.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleSyncReplies = async () => {
    setSyncing(true);
    const res = await syncReplies();
    setSyncing(false);
    if (res.error) {
      toast.error(`Reply sync note: ${res.error}`);
    } else {
      toast.success(`Synced ${res.checked} messages · ${res.repliesFound} reply(s), ${res.bouncesFound} bounce(s).`);
      fetchApplications();
    }
  };

  const markOutcome = async (status) => {
    if (!selected) return;
    setBusyId(selected._id);
    try {
      await applicationApi.setStatus(selected._id, status);
      await fetchApplications();
      closeDrawer();
      toast.success(`Marked application as ${status}.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const generateFollowUp = async (application) => {
    setBusyId(application._id);
    try {
      await applicationApi.generateFollowUp(application._id);
      toast.success("Follow-up draft created in Email Drafts.");
      fetchApplications();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
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
          {effectiveFilter === "sent" || effectiveFilter === "all" ? (
            <>
              <button
                type="button"
                onClick={handleSyncReplies}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                Sync Replies
              </button>
              <a
                href={applicationApi.exportCsvUrl}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </a>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => fetchApplications()}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Quota bar */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-700">Daily sending limit</p>
            <p className="mt-1 text-xs text-zinc-500">
              {sentToday} of {dailyLimit} accepted in last 24h · {remaining} remaining
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
        {showTabs ? (
          <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
            {TABS.map((tab) => {
              const active = effectiveFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                setCheckedIds([]);
                setStatusFilter(tab.value);
              }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-zinc-500">{applications.length} record(s)</div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {(effectiveFilter === "queued" || effectiveFilter === "queue_view") &&
          applications.length > 0 ? (
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

          {visibleCheckedIds.length > 0 ? (
            <button
              type="button"
              onClick={approveSelected}
              disabled={approvingBatch || remaining === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:bg-zinc-300"
            >
              {approvingBatch ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Approve &amp; Queue ({visibleCheckedIds.length})
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
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
                    onChange={() =>
                      setCheckedIds(allChecked ? [] : selectable.map((a) => a._id))
                    }
                    disabled={selectable.length === 0}
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400"
                  />
                </th>
                <th className="px-4 py-3">Vacancy</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Resume</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Timestamp / ID</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading && applications.length === 0 ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td colSpan={7} className="px-5 py-4">
                      <div className="h-4 w-2/3 rounded bg-zinc-100" />
                    </td>
                  </tr>
                ))
              ) : null}

              {!loading && applications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <span className="rounded-full bg-zinc-100 p-3 text-zinc-400">
                        <Inbox className="h-6 w-6" />
                      </span>
                      <p className="text-sm font-medium text-zinc-700">No applications in this section</p>
                      <p className="max-w-sm text-xs text-zinc-500">
                        Visit Pending Vacancies to generate personalized email drafts from your
                        resumes.
                      </p>
                      <Link
                        href="/pending"
                        className="mt-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Go to Pending Vacancies
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
                        onChange={() =>
                          setCheckedIds((prev) =>
                            prev.includes(application._id)
                              ? prev.filter((id) => id !== application._id)
                              : [...prev, application._id],
                          )
                        }
                        disabled={!canCheck}
                        className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400 disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">
                        {job?.companyName || "Job removed"}
                      </p>
                      <p className="text-xs text-zinc-500">{job?.jobRole || "—"}</p>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-zinc-600">
                      {application.recipientEmail || job?.hrEmail || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-600">
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-indigo-500" />
                        {application.resumeId?.title || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={application.status} />
                        {application.status === "sent" ? (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                            Request Accepted
                          </span>
                        ) : null}
                        {due ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                            <CalendarClock className="h-3 w-3" /> Follow-up due
                          </span>
                        ) : null}
                      </div>
                      {application.status === "failed" && application.errorLog ? (
                        <p className="mt-1 flex max-w-xs items-center gap-1 truncate text-xs text-rose-700">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {application.errorLog}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      <p>
                        {formatDate(
                          application.status === "sent"
                            ? application.sentAt
                            : application.updatedAt,
                        )}
                      </p>
                      {application.messageId ? (
                        <p className="max-w-[140px] truncate font-mono text-[10px] text-zinc-400">
                          {application.messageId}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {["queued", "approved"].includes(application.status) ? (
                          <button
                            type="button"
                            onClick={() => handleSendNowRow(application)}
                            disabled={busyId === application._id}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
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
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Retry
                          </button>
                        ) : null}

                        {due ? (
                          <button
                            type="button"
                            onClick={() => generateFollowUp(application)}
                            disabled={busyId === application._id}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                            Follow-Up
                          </button>
                        ) : null}

                        {application.status === "sent" || application.status === "replied" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSchedulingApp(application);
                              setInterviewForm({
                                date: "",
                                meetingUrl: "",
                                round: "",
                                notes: "",
                              });
                              setInterviewOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                          >
                            <Video className="h-3.5 w-3.5" />
                            Interview
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => openApplication(application)}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                        >
                          {isEditable(application) ? "Review / Edit" : "View"}
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

      {/* Review Drawer */}
      {selected ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-zinc-900/40"
            onClick={closeDrawer}
            role="presentation"
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <span className="text-xs text-zinc-400">
                    {selected.providerUsed ? `via ${selected.providerUsed}` : ""}
                  </span>
                </div>
                <h2 className="mt-1.5 text-lg font-semibold text-zinc-900">
                  {selected.jobId?.companyName || "Job removed"} · {selected.jobId?.jobRole || "—"}
                </h2>
                <p className="text-xs text-zinc-500">To {selected.recipientEmail}</p>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-lg border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
              {actionError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {actionError}
                </p>
              ) : null}

              {editable ? (
                <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-700">Regenerate Email</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={tone}
                        onChange={(e) => setTone(e.target.value)}
                        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs"
                      >
                        {TONES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={regenerate}
                        disabled={regenerating}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        {regenerating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3 text-indigo-500" />
                        )}
                        Regenerate
                      </button>
                    </div>
                  </div>
                  <input
                    value={customNote}
                    onChange={(e) => setCustomNote(e.target.value)}
                    placeholder="Optional note (e.g., notice period / portfolio highlight)…"
                    className={inputClass}
                  />
                </div>
              ) : null}

              {selected.status === "sent" ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <span className="text-xs text-zinc-600">Record outcome:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {OUTCOMES.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => markOutcome(o.value)}
                        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-600">Subject</span>
                <input
                  value={form.subject}
                  onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                  readOnly={!editable}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="flex items-center justify-between text-xs font-medium text-zinc-600">
                  Body <span className="text-zinc-400">{bodyWords} words</span>
                </span>
                <textarea
                  rows={12}
                  value={form.body}
                  onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                  readOnly={!editable}
                  className={`${inputClass} font-mono text-xs leading-relaxed`}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-600">Attached Resume</span>
                <select
                  value={form.resumeId}
                  onChange={(e) => setForm((p) => ({ ...p, resumeId: e.target.value }))}
                  disabled={!editable}
                  className={inputClass}
                >
                  {resumes.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.title} {r.isDefault ? "(default)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-5 py-4">
              <p className="text-xs text-zinc-500">{remaining} daily quota remaining</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={!editable || saving}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Draft"}
                </button>
                {selected.status === "draft" ? (
                  <button
                    type="button"
                    onClick={approveOnly}
                    disabled={approving}
                    className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 hover:bg-sky-100"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Approve Only
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={approveAndQueue}
                  disabled={!editable || approving}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:bg-zinc-300"
                >
                  <Send className="h-3.5 w-3.5" />
                  Approve &amp; Queue
                </button>
                <button
                  type="button"
                  onClick={sendImmediately}
                  disabled={!editable || sendingNow}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:bg-zinc-300"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send Now
                </button>
              </div>
            </footer>
          </aside>
        </div>
      ) : null}

      {/* Interview modal */}
      {interviewOpen && schedulingApp ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-zinc-900/40"
            onClick={() => setInterviewOpen(false)}
            role="presentation"
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-zinc-900">Schedule Interview</h2>
            <p className="text-xs text-zinc-500">
              {schedulingApp.jobId?.companyName} · {schedulingApp.jobId?.jobRole}
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <input
                type="datetime-local"
                value={interviewForm.date}
                onChange={(e) => setInterviewForm((p) => ({ ...p, date: e.target.value }))}
                className={inputClass}
              />
              <input
                placeholder="Round (e.g. Technical Round 1)"
                value={interviewForm.round}
                onChange={(e) => setInterviewForm((p) => ({ ...p, round: e.target.value }))}
                className={inputClass}
              />
              <input
                placeholder="Meeting URL"
                value={interviewForm.meetingUrl}
                onChange={(e) =>
                  setInterviewForm((p) => ({ ...p, meetingUrl: e.target.value }))
                }
                className={inputClass}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInterviewOpen(false)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={schedulingInterview || !interviewForm.date}
                onClick={handleScheduleInterview}
                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:bg-zinc-300"
              >
                {schedulingInterview ? "Saving…" : "Save Interview"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
