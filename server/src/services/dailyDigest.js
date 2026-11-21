import Application from "../models/Application.js";
import Job from "../models/Job.js";
import Profile from "../models/Profile.js";
import { sendDigestEmail } from "./mailSender.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
};

/**
 * Collects the last day of activity: sends, replies, upcoming interviews and
 * applications whose follow-up date has passed.
 */
export const buildDigestSummary = async (now = new Date()) => {
  const since = new Date(now.getTime() - DAY_MS);

  const [
    sentToday,
    repliesToday,
    upcomingInterviews,
    dueFollowUps,
    profile,
  ] = await Promise.all([
    Application.find({ sentAt: { $gte: since } })
      .populate("jobId")
      .sort({ sentAt: -1 })
      .lean(),
    Application.find({ repliedAt: { $gte: since } })
      .populate("jobId")
      .sort({ repliedAt: -1 })
      .lean(),
    Job.find({ "interview.date": { $gte: now } })
      .sort({ "interview.date": 1 })
      .limit(10)
      .lean(),
    Application.aggregate([
      { $match: { status: "sent", followUpDate: { $lte: now } } },
      {
        $lookup: {
          from: "jobs",
          localField: "jobId",
          foreignField: "_id",
          as: "job",
        },
      },
      { $match: { "job.status": "sent" } },
      { $count: "count" },
    ]),
    Profile.findOne().lean(),
  ]);

  return {
    generatedAt: now.toISOString(),
    candidateName: profile?.fullName || "Candidate",
    sentToday: sentToday.map((application) => ({
      company: application.jobId?.companyName || "Unknown company",
      role: application.jobId?.jobRole || "—",
      subject: application.subject,
      sentAt: application.sentAt,
    })),
    repliesToday: repliesToday.map((application) => ({
      company: application.jobId?.companyName || "Unknown company",
      role: application.jobId?.jobRole || "—",
      snippet: application.replySnippet || "",
      repliedAt: application.repliedAt,
    })),
    upcomingInterviews: upcomingInterviews.map((job) => ({
      company: job.companyName,
      role: job.jobRole,
      date: job.interview?.date,
      round: job.interview?.round || "",
      meetingUrl: job.interview?.meetingUrl || "",
    })),
    dueFollowUp: dueFollowUps[0]?.count || 0,
  };
};

export const renderDigestText = (summary) => {
  const lines = [
    `Daily summary — ${formatDate(summary.generatedAt)}`,
    `Candidate: ${summary.candidateName}`,
    "",
    `Emails sent in the last 24h: ${summary.sentToday.length}`,
    ...summary.sentToday.map(
      (item) => `  • ${item.company} — ${item.role} (${formatDate(item.sentAt)})`,
    ),
    "",
    `New replies: ${summary.repliesToday.length}`,
    ...summary.repliesToday.map(
      (item) =>
        `  • ${item.company} — ${item.role}: ${item.snippet || "reply received"}`,
    ),
    "",
    `Upcoming interviews: ${summary.upcomingInterviews.length}`,
    ...summary.upcomingInterviews.map(
      (item) =>
        `  • ${formatDate(item.date)} — ${item.company} (${item.role})${
          item.round ? ` · ${item.round}` : ""
        }${item.meetingUrl ? ` · ${item.meetingUrl}` : ""}`,
    ),
    "",
    `Applications due for follow-up: ${summary.dueFollowUp}`,
    "",
    "Sent automatically by Auto-Apply.",
  ];

  return lines.join("\n");
};

export const sendDailyDigest = async () => {
  const summary = await buildDigestSummary();
  const text = renderDigestText(summary);

  const messageId = await sendDigestEmail({
    subject: `Auto-Apply daily summary — ${new Date().toISOString().slice(0, 10)}`,
    text,
  });

  return { ...summary, messageId };
};

export default { buildDigestSummary, renderDigestText, sendDailyDigest };
