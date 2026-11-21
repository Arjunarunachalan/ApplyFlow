"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarClock,
  Download,
  FileText,
  Loader2,
  Mail,
  MessageSquareReply,
  Send,
  Users,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import { analyticsApi, applicationApi, errorMessage } from "@/lib/api";

const FUNNEL_ORDER = [
  { key: "new", label: "New", bar: "bg-zinc-400" },
  { key: "draft_ready", label: "Draft ready", bar: "bg-violet-400" },
  { key: "queued", label: "Queued", bar: "bg-amber-400" },
  { key: "sent", label: "Sent", bar: "bg-emerald-400" },
  { key: "replied", label: "Replied", bar: "bg-teal-400" },
  { key: "interview", label: "Interview", bar: "bg-indigo-400" },
  { key: "rejected", label: "Rejected", bar: "bg-rose-400" },
  { key: "failed", label: "Failed", bar: "bg-red-400" },
];

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [digestSending, setDigestSending] = useState(false);
  const [digestResult, setDigestResult] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await analyticsApi.get());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSendDigest = async () => {
    setDigestSending(true);
    setDigestResult(null);
    setError(null);
    try {
      const result = await analyticsApi.sendDigest();
      setDigestResult(result);
      setError(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDigestSending(false);
    }
  };

  const daily = data?.daily || [];
  const maxDaily = Math.max(1, ...daily.map((day) => day.count));
  const funnelMax = Math.max(
    1,
    ...FUNNEL_ORDER.map((item) => data?.funnel?.[item.key] || 0),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Analytics</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sending volume, replies and the follow-ups that are slipping.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <Loader2 className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <a
            href={applicationApi.exportCsvUrl}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
          <a
            href={applicationApi.exportPdfUrl}
            download="applications-report.pdf"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <FileText className="h-4 w-4" />
            Export PDF
          </a>
          <button
            type="button"
            onClick={handleSendDigest}
            disabled={digestSending}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-60"
          >
            {digestSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            {digestSending ? "Sending…" : "Send Daily Digest Now"}
          </button>
        </div>
      </header>

      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {digestResult && (
        <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          Daily digest sent to {digestResult.to} · {digestResult.sentToday} sent, {digestResult.repliesToday} reply(s), {digestResult.upcomingInterviews} interview(s), {digestResult.dueFollowUp} due for follow-up.
        </p>
      )}

      {loading && !data ? (
        <p className="rounded-xl border border-zinc-200 bg-white px-5 py-12 text-center text-sm text-zinc-500 shadow-sm">
          Loading analytics…
        </p>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Sent" value={data.totalSent} icon={Send} accent="text-emerald-600" />
            <StatCard
              label="Response Rate"
              value={`${data.responseRate}%`}
              icon={MessageSquareReply}
              accent="text-teal-600"
              hint="(replied + interview) / sent"
            />
            <StatCard label="Interviews" value={data.interviews} icon={Users} accent="text-indigo-600" />
            <StatCard
              label="Due for Follow-Up"
              value={data.dueFollowUp}
              icon={CalendarClock}
              accent="text-amber-600"
              hint="sent, past the follow-up date, no outcome yet"
            />
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">
                  Applications sent per day
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Last {data.windowDays} days · {data.emailJobs} email and {data.portalJobs} portal
                  jobs in total
                </p>
              </div>
              <p className="text-xs text-zinc-500">Peak {maxDaily} in a day</p>
            </div>

            <div className="mt-6 flex h-40 items-end gap-1.5">
              {daily.map((day) => (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-32 w-full items-end">
                    <div
                      className={`w-full rounded-t ${
                        day.count ? "bg-indigo-500" : "bg-zinc-100"
                      }`}
                      style={{
                        height: `${Math.max(day.count ? 6 : 2, (day.count / maxDaily) * 100)}%`,
                      }}
                      title={`${day.count} sent on ${day.date}`}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-400">{shortDate(day.date)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-900">Status funnel</h2>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {FUNNEL_ORDER.map((item) => {
                const count = data.funnel?.[item.key] || 0;
                return (
                  <div key={item.key} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs font-medium capitalize text-zinc-600">
                      {item.label}
                    </span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-100">
                      <div
                        className={`h-full rounded ${item.bar}`}
                        style={{ width: `${(count / funnelMax) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs tabular-nums text-zinc-700">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-xs text-zinc-400">
              {data.totalJobs} jobs tracked · updated{" "}
              {new Date(data.generatedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
