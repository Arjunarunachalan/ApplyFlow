"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail, Save, ShieldAlert } from "lucide-react";
import { useConfirm, useToast } from "@/components/ToastProvider";
import { errorMessage, settingsApi } from "@/lib/api";

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

export default function EmailSettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusInfo, setStatusInfo] = useState(null);
  const [form, setForm] = useState({
    dailyEmailLimit: 20,
    batchEmailLimit: 10,
    sendDelaySeconds: 60,
    maxRetries: 2,
    autoSendEnabled: false,
  });

  useEffect(() => {
    settingsApi
      .get()
      .then((data) => {
        setStatusInfo(data?.email || null);
        if (data?.email) {
          setForm({
            dailyEmailLimit: data.email.dailyEmailLimit ?? 20,
            batchEmailLimit: data.email.batchEmailLimit ?? 10,
            sendDelaySeconds: data.email.sendDelaySeconds ?? 60,
            maxRetries: data.email.maxRetries ?? 2,
            autoSendEnabled: Boolean(data.email.autoSendEnabled),
          });
        }
      })
      .catch((err) => toast.error(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleToggleAutoSend = async (checked) => {
    if (checked) {
      const ok = await confirm({
        title: "Enable Explicit Automatic Sending Mode?",
        message:
          "By default ApplyFlow requires your manual approval before sending any email. Enabling Automatic Sending allows verified-contact jobs to be queued automatically when triggered. Continue?",
        confirmLabel: "Enable Auto-Send",
      });
      if (!ok) return;
    }
    setForm((p) => ({ ...p, autoSendEnabled: checked }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsApi.updateEmail({
        dailyEmailLimit: Number(form.dailyEmailLimit),
        batchEmailLimit: Number(form.batchEmailLimit),
        sendDelaySeconds: Number(form.sendDelaySeconds),
        maxRetries: Number(form.maxRetries),
        autoSendEnabled: Boolean(form.autoSendEnabled),
      });
      toast.success("Email sending controls saved.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Email Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage your connected mail account, Review-Before-Sending defaults, and conservative rate
          controls.
        </p>
      </header>

      {/* Gmail OAuth Connection Card */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                Gmail Connection &amp; Transport Status
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {statusInfo?.oauthConnected
                  ? `Connected via Gmail API OAuth 2.0 (${statusInfo.connectedEmail})`
                  : statusInfo?.legacySmtpConfigured
                    ? `Currently using legacy App Password SMTP (${statusInfo.legacySmtpAccount}). Full Gmail API OAuth 2.0 connect/disconnect arrives in Phase 5.`
                    : "No Gmail transport configured in environment yet."}
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
              statusInfo?.oauthConnected || statusInfo?.legacySmtpConfigured
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-amber-50 text-amber-700 ring-amber-200"
            }`}
          >
            {statusInfo?.oauthConnected || statusInfo?.legacySmtpConfigured ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> Active Transport
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5" /> Not Connected
              </>
            )}
          </span>
        </div>
      </section>

      {loading ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          Loading settings…
        </div>
      ) : (
        <form
          onSubmit={handleSave}
          className="flex flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Sending Mode &amp; Safety Controls</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Application-level safety throttles designed to prevent spam bursts and accidental sends.
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <label className="flex cursor-pointer items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  Mode 2 — Automatic Sending (Explicit Opt-In)
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                  Off by default (<strong>Mode 1: Review Before Sending</strong>). When enabled,
                  explicit 1-click Auto-Apply endpoints may queue applications when contact details
                  and extraction confidence are valid. Unapproved drafts never send automatically.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.autoSendEnabled}
                onChange={(e) => handleToggleAutoSend(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
            {form.autoSendEnabled ? (
              <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                Automatic Sending Mode is ON — still bounded by quota and duplicate-send guards.
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-700">
                Daily Sending Limit (default 20)
              </span>
              <input
                type="number"
                min={1}
                max={200}
                value={form.dailyEmailLimit}
                onChange={(e) => setForm((p) => ({ ...p, dailyEmailLimit: e.target.value }))}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-700">
                Max Emails Per Batch (default 10)
              </span>
              <input
                type="number"
                min={1}
                max={50}
                value={form.batchEmailLimit}
                onChange={(e) => setForm((p) => ({ ...p, batchEmailLimit: e.target.value }))}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-700">
                Delay Between Emails in Seconds (default 60s)
              </span>
              <input
                type="number"
                min={15}
                max={600}
                value={form.sendDelaySeconds}
                onChange={(e) => setForm((p) => ({ ...p, sendDelaySeconds: e.target.value }))}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-700">
                Max Temporary Failure Retries (default 2)
              </span>
              <input
                type="number"
                min={0}
                max={5}
                value={form.maxRetries}
                onChange={(e) => setForm((p) => ({ ...p, maxRetries: e.target.value }))}
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex justify-end border-t border-zinc-200 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Email Settings
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
