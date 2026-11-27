import Application from "../models/Application.js";
import Job, { JOB_STATUSES } from "../models/Job.js";
import { sendDailyDigest } from "../services/dailyDigest.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;
const FUNNEL_STATUSES = [
  "new",
  "draft_ready",
  "queued",
  "sent",
  "replied",
  "interview",
  "rejected",
  "failed",
];

const startOfUtcDay = (date) => {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

// POST /api/analytics/send-digest — sends the summary to the owner's mailbox
export const sendDigest = async (_req, res) => {
  try {
    const summary = await sendDailyDigest();
    return res.json({
      sent: true,
      to: process.env.GMAIL_USER || null,
      sentToday: summary.sentToday.length,
      repliesToday: summary.repliesToday.length,
      upcomingInterviews: summary.upcomingInterviews.length,
      dueFollowUp: summary.dueFollowUp,
      messageId: summary.messageId,
    });
  } catch (error) {
    return res.status(500).json({ error: `Digest was not sent: ${error.message}` });
  }
};

// GET /api/analytics
export const getAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const since = startOfUtcDay(new Date(now.getTime() - (WINDOW_DAYS - 1) * DAY_MS));

    const [
      totalJobs,
      emailJobs,
      portalJobs,
      statusGroups,
      recentSends,
      dueFollowUps,
      pendingSummary,
    ] = await Promise.all([
      Job.countDocuments({ userId }),
      Job.countDocuments({ userId, applicationType: "email" }),
      Job.countDocuments({ userId, applicationType: "portal" }),
      Job.aggregate([
        { $match: { userId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Application.find({ userId, sentAt: { $gte: since } }, { sentAt: 1 }).lean(),
      Application.aggregate([
        { $match: { userId, status: "sent", followUpDate: { $lte: now } } },
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
      Promise.all([
        Job.countDocuments({ userId, lifecycleStatus: { $nin: ["SENT", "ARCHIVED"] } }),
        Job.countDocuments({
          userId,
          lifecycleStatus: { $nin: ["SENT", "ARCHIVED"] },
          applicationType: "email",
        }),
        Job.countDocuments({
          userId,
          lifecycleStatus: { $nin: ["SENT", "ARCHIVED"] },
          applicationType: { $ne: "email" },
        }),
        Job.countDocuments({
          userId,
          lifecycleStatus: { $in: ["EMAIL_DRAFT_READY", "AWAITING_APPROVAL"] },
        }),
        Job.countDocuments({
          userId,
          lifecycleStatus: { $in: ["APPROVED", "QUEUED", "SENDING"] },
        }),
        Job.countDocuments({
          userId,
          lifecycleStatus: {
            $in: ["SEND_FAILED", "EMAIL_GENERATION_FAILED", "EXTRACTION_FAILED"],
          },
        }),
      ]),
    ]);

    const counts = new Map(statusGroups.map((group) => [group._id, group.count]));

    const funnel = {};
    for (const status of FUNNEL_STATUSES) funnel[status] = counts.get(status) || 0;
    // Any status outside the funnel list still contributes to the job total.
    for (const [status, count] of counts) {
      if (!(status in funnel) && JOB_STATUSES.includes(status)) funnel[status] = count;
    }

    const totalSent =
      funnel.sent + funnel.replied + funnel.interview + funnel.rejected;
    const responses = funnel.replied + funnel.interview;
    const responseRate = totalSent
      ? Math.round((responses / totalSent) * 1000) / 10
      : 0;

    const buckets = new Map();
    for (let index = 0; index < WINDOW_DAYS; index += 1) {
      const date = new Date(since.getTime() + index * DAY_MS);
      buckets.set(dayKey(date), 0);
    }
    for (const application of recentSends) {
      if (!application.sentAt) continue;
      const key = dayKey(application.sentAt);
      if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
    }

    const daily = [...buckets.entries()].map(([date, count]) => ({ date, count }));

    const [
      pendingVacancies,
      emailAvailable,
      emailNotFound,
      draftsReady,
      approvedReadyToSend,
      failedApplications,
    ] = pendingSummary;

    return res.json({
      totalJobs,
      emailJobs,
      portalJobs,
      unknownJobs: Math.max(0, totalJobs - emailJobs - portalJobs),
      funnel,
      totalSent,
      responseRate,
      interviews: funnel.interview,
      dueFollowUp: dueFollowUps[0]?.count || 0,
      summary: {
        pendingVacancies,
        emailAvailable,
        emailNotFound,
        draftsReady,
        approvedReadyToSend,
        failedApplications,
      },
      daily,
      windowDays: WINDOW_DAYS,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
