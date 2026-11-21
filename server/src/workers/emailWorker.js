import dotenv from "dotenv";
dotenv.config();

import { Queue, Worker } from "bullmq";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { redisConnection } from "../config/redis.js";
import Application from "../models/Application.js";
import Job from "../models/Job.js";
import { sendApplicationEmail } from "../services/mailSender.js";
import { syncReplies } from "../services/replySync.js";
import { sendDailyDigest } from "../services/dailyDigest.js";

// The worker writes status back to MongoDB, so it needs its own connection.
await connectDB();

const readDelay = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const FOLLOW_UP_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const MIN_DELAY_MS = readDelay(process.env.EMAIL_MIN_DELAY_MS, 15000);
const MAX_DELAY_MS = Math.max(MIN_DELAY_MS, readDelay(process.env.EMAIL_MAX_DELAY_MS, 40000));
// The queue limiter already spaces jobs out; the extra pause makes the gaps
// uneven, the way a person sending mail by hand would look.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const humanDelay = () =>
  sleep(MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)));

const worker = new Worker(
  "application-emails",
  async (job) => {
    const { applicationId, jobId, to, subject, body, resumePath, resumeFileName } = job.data;
    console.log(`[Job ${job.id}] Sending application to ${to}...`);

    await humanDelay();

    const messageId = await sendApplicationEmail({
      to,
      subject,
      body,
      resumePath,
      resumeFileName,
    });

    console.log(`[Job ${job.id}] Sent! Message ID: ${messageId}`);

    if (applicationId) {
      const sentAt = new Date();
      const application = await Application.findById(applicationId);

      if (application) {
        application.status = "sent";
        application.messageId = messageId;
        application.sentAt = sentAt;
        application.errorLog = "";
        // Five days of silence is long enough to be worth a nudge, and an
        // explicit follow-up date set by the user is never overwritten.
        if (!application.followUpDate) {
          application.followUpDate = new Date(sentAt.getTime() + FOLLOW_UP_DAYS * DAY_MS);
        }
        await application.save();
      }
    }

    // A follow-up leaves the job's own outcome (sent, replied, interview…)
    // untouched; only a first application advances it to "sent".
    if (jobId) {
      const isFollowUp = job.data?.isFollowUp === true;
      if (!isFollowUp) {
        await Job.findByIdAndUpdate(jobId, { $set: { status: "sent" } });
      }
    }

    return { messageId };
  },
  {
    connection: redisConnection,
    concurrency: 1,
    limiter: {
      max: 1,
      duration: 15000, // 1 email per 15 seconds
    },
  },
);

worker.on("failed", async (job, err) => {
  console.error(`[Job ${job?.id}] Failed:`, err.message);

  const attempts = job?.opts?.attempts || 1;
  if (!job || job.attemptsMade < attempts) return;

  const { applicationId, jobId } = job.data || {};

  try {
    if (applicationId) {
      await Application.findByIdAndUpdate(applicationId, {
        $set: { status: "failed", errorLog: err.message },
      });
    }
    if (jobId) {
      await Job.findByIdAndUpdate(jobId, { $set: { status: "failed" } });
    }
  } catch (updateError) {
    console.error(`[Job ${job.id}] Could not record the failure:`, updateError.message);
  }
});

// Background housekeeping: IMAP reply/bounce scans and the optional digest.
const BACKGROUND_QUEUE = "background-tasks";

const readToggle = (value, fallback) => {
  if (value === undefined || value === "") return fallback;
  return String(value).toLowerCase() === "true";
};

// On by default so replies land without setup; set ENABLE_REPLY_SYNC=false to
// turn the periodic scan off (the manual endpoint keeps working).
const replySyncEnabled =
  String(process.env.ENABLE_REPLY_SYNC ?? "true").toLowerCase() !== "false";
const digestEnabled = readToggle(process.env.ENABLE_DAILY_DIGEST, false);
const replySyncIntervalMin = Math.max(
  5,
  Number(process.env.REPLY_SYNC_INTERVAL_MIN) || 30,
);

const backgroundQueue = new Queue(BACKGROUND_QUEUE, { connection: redisConnection });

const backgroundWorker = new Worker(
  BACKGROUND_QUEUE,
  async (job) => {
    if (job.name === "sync-replies") {
      const result = await syncReplies();
      if (result.error) {
        console.warn(`[Background] Reply sync: ${result.error}`);
      } else {
        console.log(
          `[Background] Reply sync checked ${result.checked} message(s), ` +
            `${result.repliesFound} reply(ies), ${result.bouncesFound} bounce(s)`,
        );
      }
      return result;
    }

    if (job.name === "daily-digest") {
      const summary = await sendDailyDigest();
      console.log(
        `[Background] Daily digest sent (${summary.sentToday.length} sent, ` +
          `${summary.repliesToday.length} replies, ` +
          `${summary.upcomingInterviews.length} interviews)`,
      );
      return { sentToday: summary.sentToday.length };
    }

    return null;
  },
  { connection: redisConnection, concurrency: 1 },
);

if (replySyncEnabled) {
  await backgroundQueue.add(
    "sync-replies",
    {},
    {
      repeat: { every: replySyncIntervalMin * 60 * 1000 },
      removeOnComplete: 20,
      removeOnFail: 20,
    },
  );
  console.log(
    `Reply sync scheduled every ${replySyncIntervalMin} minute(s) via BullMQ`,
  );
}

if (digestEnabled) {
  await backgroundQueue.add(
    "daily-digest",
    {},
    {
      repeat: { pattern: "0 9 * * *" },
      removeOnComplete: 20,
      removeOnFail: 20,
    },
  );
  console.log("Daily digest scheduled for 09:00 via BullMQ");
}

const shutdown = async (signal) => {
  console.log(`${signal} received, closing the email worker...`);
  await worker.close();
  await backgroundWorker.close();
  await backgroundQueue.close();
  await mongoose.disconnect();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log(
  `Email worker is running (human delay ${MIN_DELAY_MS}-${MAX_DELAY_MS} ms) and waiting for jobs...`,
);
