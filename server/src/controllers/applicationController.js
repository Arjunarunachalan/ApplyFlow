import fs from "node:fs";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import Application, {
  APPLICATION_STATUSES,
  OUTCOME_STATUSES,
} from "../models/Application.js";
import Job from "../models/Job.js";
import Profile from "../models/Profile.js";
import Resume from "../models/Resume.js";
import { emailQueue } from "../workers/emailQueue.js";
import { generateApplicationEmail, generateFollowUpEmail } from "../services/aiGenerator.js";
import { sendApplicationEmail } from "../services/mailSender.js";
import { ensureResumeOnDisk, getResumeBuffer } from "../utils/resumeFile.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const EDITABLE_STATUSES = ["draft", "approved", "failed"];
const QUEUEABLE_STATUSES = ["draft", "approved", "failed"];
// A job is spoken for while its application is queued or already sent.
const BLOCKING_STATUSES = ["queued", "sent"];
const DEFAULT_DAILY_LIMIT = 20;
const FOLLOW_UP_WINDOW_DAYS = 5;

const isObjectId = (value) => mongoose.isValidObjectId(value);

const resolveDailyLimit = async (userId) => {
  const filter = userId ? { userId } : {};
  const profile = await Profile.findOne(filter).lean();
  const fromProfile = Number(profile?.dailyEmailLimit);
  if (Number.isFinite(fromProfile) && fromProfile > 0) return Math.floor(fromProfile);

  const fromEnv = Number(process.env.DAILY_EMAIL_LIMIT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);

  return DEFAULT_DAILY_LIMIT;
};

// sentToday counts only sends from the last 24 hours, and queued applications
// are subtracted from the headroom so approving twice cannot overshoot.
export const getQuota = async (userId) => {
  const ownerFilter = userId ? { userId } : {};
  const since = new Date(Date.now() - DAY_MS);
  const [sentToday, queued, dailyLimit] = await Promise.all([
    Application.countDocuments({ ...ownerFilter, status: "sent", sentAt: { $gte: since } }),
    Application.countDocuments({ ...ownerFilter, status: "queued" }),
    resolveDailyLimit(userId),
  ]);

  return {
    sentToday,
    queued,
    dailyLimit,
    remaining: Math.max(0, dailyLimit - sentToday - queued),
  };
};

const castError = (error) =>
  error.name === "CastError" ? { error: "Invalid id" } : null;

// The resume attached to a send: an explicit choice, the default, or the newest.
export const resolveResume = async (resumeId, userId) => {
  const ownerFilter = userId ? { userId } : {};
  if (resumeId) {
    if (!isObjectId(resumeId)) return { error: "Invalid resume id", status: 400 };
    const resume = await Resume.findOne({ _id: resumeId, ...ownerFilter });
    if (!resume) return { error: "Resume not found", status: 400 };
    return { resume };
  }

  const resume =
    (await Resume.findOne({ ...ownerFilter, isDefault: true })) ||
    (await Resume.findOne(ownerFilter).sort({ uploadedAt: -1 }));
  if (!resume) {
    return { error: "Upload a resume before generating an application", status: 400 };
  }
  return { resume };
};

// Generates copy for one vacancy and reuses any editable draft so repeated
// generations do not stack applications on the same job.
export const createDraftForJob = async ({ userId, job, profile, resume, tone, customNote }) => {
  const { subject, body, providerUsed } = await generateApplicationEmail({
    job,
    profile,
    resume,
    tone,
    customNote,
  });

  const ownerId = userId || job.userId;
  let application = await Application.findOne({
    ...(ownerId ? { userId: ownerId } : {}),
    jobId: job._id,
    status: { $in: EDITABLE_STATUSES },
    isFollowUp: { $ne: true },
  }).sort({ updatedAt: -1 });
  const existed = Boolean(application);

  if (application) {
    Object.assign(application, {
      userId: ownerId,
      subject,
      body,
      resumeId: resume._id,
      recipientEmail: job.hrEmail,
      status: "draft",
      deliveryStatus: "NOT_SENT",
      errorLog: "",
      providerUsed,
    });
  } else {
    application = new Application({
      userId: ownerId,
      jobId: job._id,
      resumeId: resume._id,
      subject,
      body,
      recipientEmail: job.hrEmail,
      status: "draft",
      deliveryStatus: "NOT_SENT",
      providerUsed,
    });
  }

  await application.save();

  job.status = "draft_ready";
  job.lifecycleStatus = "EMAIL_DRAFT_READY";
  job.resumeIdUsed = resume._id;
  await job.save();

  return { application, existed };
};

// GET /api/applications?status=draft
export const listApplications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status } = req.query;
    const query = { userId };

    // "followup" is a derived view: sent, past its follow-up date, job still sent.
    if (status === "followup") {
      const [applications, quota] = await Promise.all([
        Application.find({
          userId,
          status: "sent",
          followUpDate: { $lte: new Date() },
        })
          .populate("jobId")
          .populate("resumeId", "-fileData")
          .sort({ followUpDate: 1 })
          .lean(),
        getQuota(userId),
      ]);

      const due = applications.filter(
        (application) => application.jobId && application.jobId.status === "sent",
      );

      return res.json({ applications: due, quota });
    }

    if (status === "queue_view") {
      query.status = { $in: ["approved", "queued"] };
    } else if (status && status !== "all") {
      if (!APPLICATION_STATUSES.includes(status)) {
        return res
          .status(400)
          .json({ error: `status must be one of ${APPLICATION_STATUSES.join(", ")}` });
      }
      query.status = status;
    }

    const [applications, quota] = await Promise.all([
      Application.find(query)
        .populate("jobId")
        .populate("resumeId", "-fileData")
        .sort({ createdAt: -1 })
        .lean(),
      getQuota(userId),
    ]);

    return res.json({ applications, quota });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/applications/generate/:jobId
export const generateDraft = async (req, res) => {
  try {
    const userId = req.user._id;
    if (!isObjectId(req.params.jobId)) {
      return res.status(400).json({ error: "Invalid job id" });
    }

    const job = await Job.findOne({ _id: req.params.jobId, userId });
    if (!job) return res.status(404).json({ error: "Job not found" });

    if (job.applicationType !== "email") {
      return res
        .status(400)
        .json({ error: "Only email applications can generate a draft; use the portal link for this job." });
    }

    if (!job.hrEmail) {
      return res.status(400).json({ error: "This job has no HR email address" });
    }

    const { resumeId, tone, customNote } = req.body || {};
    const resolved = await resolveResume(resumeId, userId);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });

    const active = await Application.findOne({
      userId,
      jobId: job._id,
      status: { $in: BLOCKING_STATUSES },
      isFollowUp: { $ne: true },
    });
    if (active) {
      return res
        .status(409)
        .json({ error: `An application for this job is already ${active.status}` });
    }

    const profile = (await Profile.findOne({ userId })) || {};
    const { application, existed } = await createDraftForJob({
      userId,
      job,
      profile,
      resume: resolved.resume,
      tone,
      customNote,
    });

    const populated = await application.populate(["jobId", { path: "resumeId", select: "-fileData" }]);
    return res.status(existed ? 200 : 201).json(populated);
  } catch (error) {
    const cast = castError(error);
    if (cast) return res.status(400).json(cast);
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/applications/generate-batch
export const generateBatch = async (req, res) => {
  try {
    const userId = req.user._id;
    const { jobIds, allNew = false, resumeId, tone, customNote } = req.body || {};
    const ids = Array.isArray(jobIds) ? jobIds.map(String).filter(Boolean) : [];

    if (!ids.length && !allNew) {
      return res.status(400).json({ error: "Provide jobIds or set allNew to true" });
    }
    if (ids.some((id) => !isObjectId(id))) {
      return res.status(400).json({ error: "Every jobId must be a valid id" });
    }

    const resolved = await resolveResume(resumeId, userId);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });

    const profile = (await Profile.findOne({ userId })) || {};

    const jobs = ids.length
      ? await Job.find({ userId, _id: { $in: ids } })
      : await Job.find({ userId, applicationType: "email", status: "new" }).sort({ createdAt: -1 });

    const byId = new Map(jobs.map((job) => [String(job._id), job]));
    const order = ids.length ? ids : jobs.map((job) => String(job._id));

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    const results = [];

    // Sequential on purpose: one AI request at a time respects provider limits.
    for (const jobId of order) {
      const job = byId.get(String(jobId));

      const skip = (reason) => {
        skipped += 1;
        results.push({
          jobId: String(jobId),
          applicationId: null,
          status: "skipped",
          providerUsed: null,
          error: reason,
        });
      };

      if (!job) {
        skip("Job not found");
        continue;
      }
      if (job.applicationType !== "email") {
        skip("Not an email application");
        continue;
      }
      if (BLOCKING_STATUSES.includes(job.status)) {
        skip(`Job is already ${job.status}`);
        continue;
      }
      if (!job.hrEmail) {
        skip("This job has no HR email address");
        continue;
      }

      try {
        const { application } = await createDraftForJob({
          userId,
          job,
          profile,
          resume: resolved.resume,
          tone,
          customNote,
        });
        generated += 1;
        results.push({
          jobId: String(job._id),
          applicationId: String(application._id),
          status: "generated",
          providerUsed: application.providerUsed,
          error: null,
        });
      } catch (error) {
        failed += 1;
        results.push({
          jobId: String(job._id),
          applicationId: null,
          status: "failed",
          providerUsed: null,
          error: error.message,
        });
      }
    }

    return res.json({ generated, skipped, failed, results });
  } catch (error) {
    const cast = castError(error);
    if (cast) return res.status(400).json(cast);
    return res.status(500).json({ error: error.message });
  }
};

// PATCH /api/applications/:id
export const updateApplication = async (req, res) => {
  try {
    const userId = req.user._id;
    const application = await Application.findOne({ _id: req.params.id, userId });
    if (!application) return res.status(404).json({ error: "Application not found" });

    if (!EDITABLE_STATUSES.includes(application.status)) {
      return res
        .status(400)
        .json({ error: `A ${application.status} application can no longer be edited` });
    }

    const { subject, body, resumeId, followUpDate } = req.body || {};

    if (subject !== undefined) {
      const nextSubject = String(subject).trim();
      if (!nextSubject) return res.status(400).json({ error: "Subject cannot be empty" });
      application.subject = nextSubject;
    }

    if (body !== undefined) {
      const nextBody = String(body);
      if (!nextBody.trim()) return res.status(400).json({ error: "Body cannot be empty" });
      application.body = nextBody;
    }

    if (resumeId !== undefined) {
      if (!isObjectId(resumeId)) return res.status(400).json({ error: "Invalid resume id" });
      const resume = await Resume.findOne({ _id: resumeId, userId });
      if (!resume) return res.status(400).json({ error: "Resume not found" });
      application.resumeId = resume._id;
    }

    if (followUpDate !== undefined) {
      if (!followUpDate) {
        application.followUpDate = undefined;
      } else {
        const parsed = new Date(followUpDate);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ error: "followUpDate must be a valid date" });
        }
        application.followUpDate = parsed;
      }
    }

    await application.save();

    const populated = await application.populate([
      "jobId",
      { path: "resumeId", select: "-fileData" },
    ]);
    return res.json(populated);
  } catch (error) {
    const cast = castError(error);
    if (cast) return res.status(400).json(cast);
    return res.status(500).json({ error: error.message });
  }
};

// Shared by single and batch approval so both enforce the same safeguards.
export const queueApplication = async (application) => {
  if (!QUEUEABLE_STATUSES.includes(application.status)) {
    return {
      status: 400,
      error: `Only draft, approved, or failed applications can be queued (this one is ${application.status})`,
    };
  }

  const job = application.jobId;
  if (!job) {
    return { status: 400, error: "The job for this application no longer exists" };
  }

  const resume = application.resumeId;
  if (!resume) {
    return { status: 400, error: "Attach a resume before sending" };
  }

  const to = application.recipientEmail || job.hrEmail;
  if (!to) {
    return { status: 400, error: "This application has no recipient email" };
  }

  const ownerId = application.userId || job.userId;
  const quota = await getQuota(ownerId);
  if (quota.sentToday + quota.queued >= quota.dailyLimit) {
    return {
      status: 429,
      error: `Daily limit reached: ${quota.sentToday} sent and ${quota.queued} queued in the last 24 hours against a limit of ${quota.dailyLimit}. Raise the limit on Email Settings or try again later.`,
    };
  }

  const validFilePath = await ensureResumeOnDisk(resume);
  const resumeBuffer = getResumeBuffer(resume);

  if (!validFilePath && !resumeBuffer) {
    return {
      status: 400,
      error: `The resume file is missing (${resume.fileName}). Re-upload it and try again.`,
    };
  }

  if (!application.isFollowUp) {
    const duplicate = await Application.findOne({
      ...(ownerId ? { userId: ownerId } : {}),
      _id: { $ne: application._id },
      jobId: job._id,
      recipientEmail: to,
      status: { $in: BLOCKING_STATUSES },
    });
    if (duplicate) {
      return {
        status: 409,
        error: `This application is already ${duplicate.status} for the same recipient`,
      };
    }
  }

  const queued = await emailQueue.add("send-application", {
    applicationId: application._id.toString(),
    jobId: job._id.toString(),
    to,
    subject: application.subject,
    body: application.body,
    resumePath: validFilePath || resume.filePath,
    resumeFileName: resume.fileName,
    isFollowUp: application.isFollowUp === true,
  });

  application.status = "queued";
  application.deliveryStatus = "QUEUED";
  application.approvedAt = application.approvedAt || new Date();
  application.errorLog = "";
  await application.save();

  // A follow-up does not change where the original application stands.
  if (!application.isFollowUp) {
    job.status = "queued";
    job.lifecycleStatus = "QUEUED";
    await job.save();
  }

  return { ok: true, queueJobId: queued.id, application };
};

// Dispatches an email immediately via Nodemailer without waiting on the background queue.
export const sendApplicationNow = async (application) => {
  const job = application.jobId;
  if (!job) {
    return { status: 400, error: "The job for this application no longer exists" };
  }

  const resume = application.resumeId;
  if (!resume) {
    return { status: 400, error: "Attach a resume before sending" };
  }

  const to = application.recipientEmail || job.hrEmail;
  if (!to) {
    return { status: 400, error: "This application has no recipient email" };
  }

  const ownerId = application.userId || job.userId;
  const quota = await getQuota(ownerId);
  if (quota.sentToday >= quota.dailyLimit) {
    return {
      status: 429,
      error: `Daily limit reached: ${quota.sentToday} sent in the last 24 hours against a limit of ${quota.dailyLimit}. Raise the limit on Email Settings or try again later.`,
    };
  }

  const validFilePath = await ensureResumeOnDisk(resume);
  const resumeBuffer = getResumeBuffer(resume);

  if (!validFilePath && !resumeBuffer) {
    return {
      status: 400,
      error: `The resume file is missing (${resume.fileName}). Re-upload it and try again.`,
    };
  }

  try {
    const messageId = await sendApplicationEmail({
      to,
      subject: application.subject,
      body: application.body,
      resumePath: validFilePath || resume.filePath,
      resumeFileName: resume.fileName,
      resumeBuffer,
    });

    const sentAt = new Date();
    application.status = "sent";
    application.deliveryStatus = "ACCEPTED_BY_GMAIL";
    application.approvedAt = application.approvedAt || sentAt;
    application.messageId = messageId;
    application.sentAt = sentAt;
    application.errorLog = "";
    if (!application.followUpDate) {
      application.followUpDate = new Date(sentAt.getTime() + FOLLOW_UP_WINDOW_DAYS * DAY_MS);
    }
    await application.save();

    if (!application.isFollowUp) {
      job.status = "sent";
      job.lifecycleStatus = "SENT";
      await job.save();
    }

    return { ok: true, messageId, application };
  } catch (err) {
    console.error(`[sendApplicationNow] Failed to send email to ${to}: ${err.message}`);
    application.status = "failed";
    application.deliveryStatus = "FAILED";
    application.errorLog = err.message;
    await application.save();
    if (!application.isFollowUp) {
      job.status = "failed";
      job.lifecycleStatus = "SEND_FAILED";
      await job.save();
    }
    return { status: 500, error: `Failed to send email: ${err.message}` };
  }
};

// POST /api/applications/:id/approve — explicitly marks draft as approved without auto-queuing
export const approveOnly = async (req, res) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      userId: req.user._id,
    })
      .populate("jobId")
      .populate("resumeId", "-fileData");

    if (!application) return res.status(404).json({ error: "Application not found" });
    if (!EDITABLE_STATUSES.includes(application.status)) {
      return res.status(400).json({
        error: `Only draft or failed applications can be approved (currently ${application.status})`,
      });
    }

    application.status = "approved";
    application.approvedAt = new Date();
    application.errorLog = "";
    await application.save();

    if (application.jobId && !application.isFollowUp) {
      application.jobId.status = "approved";
      application.jobId.lifecycleStatus = "APPROVED";
      await application.jobId.save();
    }

    return res.json({ message: "Application approved", application: application.toObject() });
  } catch (error) {
    const cast = castError(error);
    if (cast) return res.status(400).json(cast);
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/applications/approve-only-batch
export const approveOnlyBatch = async (req, res) => {
  try {
    const userId = req.user._id;
    const { applicationIds } = req.body || {};
    if (!Array.isArray(applicationIds) || !applicationIds.length) {
      return res.status(400).json({ error: "applicationIds must be a non-empty array" });
    }
    if (applicationIds.some((id) => !isObjectId(id))) {
      return res.status(400).json({ error: "Every applicationId must be a valid id" });
    }

    let approved = 0;
    let skipped = 0;
    for (const id of applicationIds) {
      const app = await Application.findOne({ _id: id, userId }).populate("jobId");
      if (!app || !EDITABLE_STATUSES.includes(app.status)) {
        skipped += 1;
        continue;
      }
      app.status = "approved";
      app.approvedAt = new Date();
      app.errorLog = "";
      await app.save();
      if (app.jobId && !app.isFollowUp) {
        app.jobId.status = "approved";
        app.jobId.lifecycleStatus = "APPROVED";
        await app.jobId.save();
      }
      approved += 1;
    }

    return res.json({ approved, skipped });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/applications/:id/send-now
export const sendNow = async (req, res) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      userId: req.user._id,
    })
      .populate("jobId")
      .populate("resumeId");

    if (!application) return res.status(404).json({ error: "Application not found" });

    // Sending from UI requires explicit review or approved/queued status
    if (!["draft", "approved", "queued", "failed"].includes(application.status)) {
      return res.status(400).json({ error: `Cannot send application with status ${application.status}` });
    }

    application.approvedAt = application.approvedAt || new Date();
    const outcome = await sendApplicationNow(application);
    if (outcome.error) return res.status(outcome.status || 500).json({ error: outcome.error });

    return res.json({
      message: "Application sent successfully",
      messageId: outcome.messageId,
      application: outcome.application.toObject(),
    });
  } catch (error) {
    const cast = castError(error);
    if (cast) return res.status(400).json(cast);
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/applications/process-queue
export const processQueue = async (req, res) => {
  try {
    const userId = req.user._id;
    const queuedApps = await Application.find({
      userId,
      status: { $in: ["queued", "approved"] },
    })
      .populate("jobId")
      .populate("resumeId")
      .sort({ createdAt: 1 });

    if (!queuedApps.length) {
      return res.json({ message: "No approved or queued applications found", processed: 0, sent: 0, failed: 0 });
    }

    let sent = 0;
    let failed = 0;
    const results = [];

    for (const app of queuedApps) {
      const outcome = await sendApplicationNow(app);
      if (outcome.ok) {
        sent += 1;
        results.push({ id: app._id, status: "sent", messageId: outcome.messageId });
      } else {
        failed += 1;
        results.push({ id: app._id, status: "failed", error: outcome.error });
      }
    }

    return res.json({
      message: `Processed ${queuedApps.length} application(s): ${sent} sent, ${failed} failed`,
      processed: queuedApps.length,
      sent,
      failed,
      results,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/applications/auto-apply/:jobId
export const autoApply = async (req, res) => {
  try {
    const userId = req.user._id;
    if (!isObjectId(req.params.jobId)) {
      return res.status(400).json({ error: "Invalid job id" });
    }

    const profile = (await Profile.findOne({ userId })) || {};
    if (!profile.autoSendEnabled) {
      return res.status(403).json({
        error: "Automatic sending mode is disabled by default. Review drafts first, or enable Automatic Sending in Email Settings.",
      });
    }

    const job = await Job.findOne({ _id: req.params.jobId, userId });
    if (!job) return res.status(404).json({ error: "Job not found" });

    if (job.applicationType !== "email") {
      return res
        .status(400)
        .json({ error: "Only email jobs can be auto-applied; use the portal link for this job." });
    }

    if (!job.hrEmail) {
      return res.status(400).json({ error: "This job has no HR email address" });
    }

    const { resumeId, tone, customNote } = req.body || {};
    const resolved = await resolveResume(resumeId, userId);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });

    const { application } = await createDraftForJob({
      userId,
      job,
      profile,
      resume: resolved.resume,
      tone,
      customNote,
    });

    await application.populate(["jobId", "resumeId"]);
    application.approvedAt = new Date();

    const outcome = await sendApplicationNow(application);
    if (outcome.error) {
      return res.status(outcome.status || 500).json({
        error: outcome.error,
        application: outcome.application ? outcome.application.toObject() : application.toObject(),
      });
    }

    return res.status(200).json({
      message: `Auto-applied successfully to ${job.companyName}!`,
      messageId: outcome.messageId,
      application: outcome.application.toObject(),
    });
  } catch (error) {
    const cast = castError(error);
    if (cast) return res.status(400).json(cast);
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/applications/auto-apply-batch
export const autoApplyBatch = async (req, res) => {
  try {
    const userId = req.user._id;
    const { jobIds, resumeId, tone, customNote } = req.body || {};
    const ids = Array.isArray(jobIds) ? jobIds.map(String).filter(Boolean) : [];

    if (!ids.length) {
      return res.status(400).json({ error: "Provide an array of jobIds" });
    }

    const profile = (await Profile.findOne({ userId })) || {};
    if (!profile.autoSendEnabled) {
      return res.status(403).json({
        error: "Automatic sending mode is disabled by default. Review drafts first, or enable Automatic Sending in Email Settings.",
      });
    }

    const resolved = await resolveResume(resumeId, userId);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });

    let queued = 0;
    let failed = 0;
    let skipped = 0;
    let stoppedByQuota = false;
    const results = [];

    for (const jobId of ids) {
      if (stoppedByQuota) {
        skipped += 1;
        results.push({ jobId, status: "skipped", reason: "Stopped: daily quota reached" });
        continue;
      }

      const quota = await getQuota(userId);
      if (quota.sentToday + quota.queued >= quota.dailyLimit) {
        stoppedByQuota = true;
        skipped += 1;
        results.push({ jobId, status: "skipped", reason: "Daily quota limit reached" });
        continue;
      }

      const job = await Job.findOne({ _id: jobId, userId });
      if (!job) {
        skipped += 1;
        results.push({ jobId, status: "skipped", reason: "Job not found" });
        continue;
      }

      if (job.applicationType !== "email") {
        skipped += 1;
        results.push({ jobId, status: "skipped", reason: "Not an email application" });
        continue;
      }

      if (!job.hrEmail) {
        skipped += 1;
        results.push({ jobId, status: "skipped", reason: "This job has no HR email address" });
        continue;
      }

      if (BLOCKING_STATUSES.includes(job.status)) {
        skipped += 1;
        results.push({ jobId, status: "skipped", reason: `Job already ${job.status}` });
        continue;
      }

      try {
        const { application } = await createDraftForJob({
          userId,
          job,
          profile,
          resume: resolved.resume,
          tone,
          customNote,
        });

        application.jobId = job;
        application.resumeId = resolved.resume;
        application.approvedAt = new Date();
        const outcome = await queueApplication(application);

        if (outcome.ok) {
          queued += 1;
          results.push({
            jobId,
            company: job.companyName,
            status: "queued",
            applicationId: application._id,
            queueJobId: outcome.queueJobId,
          });
        } else {
          failed += 1;
          results.push({
            jobId,
            company: job.companyName,
            status: "failed",
            error: outcome.error,
          });
        }
      } catch (err) {
        failed += 1;
        results.push({ jobId, status: "failed", error: err.message });
      }
    }

    const finalQuota = await getQuota(userId);
    return res.json({
      queued,
      skipped,
      failed,
      stoppedByQuota,
      remainingQuota: finalQuota.remaining,
      results,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/applications/:id/approve-and-queue
export const approveAndQueue = async (req, res) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      userId: req.user._id,
    })
      .populate("jobId")
      .populate("resumeId");

    if (!application) return res.status(404).json({ error: "Application not found" });

    const outcome = await queueApplication(application);
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });

    return res.status(202).json({
      message: "Application approved and queued",
      queueJobId: outcome.queueJobId,
      application: outcome.application.toObject(),
    });
  } catch (error) {
    const cast = castError(error);
    if (cast) return res.status(400).json(cast);
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/applications/approve-batch
export const approveBatch = async (req, res) => {
  try {
    const userId = req.user._id;
    const { applicationIds } = req.body || {};
    if (!Array.isArray(applicationIds) || !applicationIds.length) {
      return res.status(400).json({ error: "applicationIds must be a non-empty array" });
    }
    if (applicationIds.some((id) => !isObjectId(id))) {
      return res.status(400).json({ error: "Every applicationId must be a valid id" });
    }

    let queued = 0;
    let skipped = 0;
    let stoppedByQuota = false;
    const results = [];

    for (const id of applicationIds) {
      if (stoppedByQuota) {
        skipped += 1;
        continue;
      }

      const application = await Application.findOne({ _id: id, userId })
        .populate("jobId")
        .populate("resumeId");

      if (!application) {
        skipped += 1;
        results.push({ applicationId: id, status: "skipped", error: "Application not found" });
        continue;
      }

      const outcome = await queueApplication(application);

      if (outcome.error) {
        if (outcome.status === 429) stoppedByQuota = true;
        skipped += 1;
        results.push({ applicationId: id, status: "skipped", error: outcome.error });
        continue;
      }

      queued += 1;
      results.push({ applicationId: id, status: "queued", error: null });
    }

    const quota = await getQuota(userId);

    return res.json({
      queued,
      skipped,
      stoppedByQuota,
      remainingQuota: quota.remaining,
      results,
    });
  } catch (error) {
    const cast = castError(error);
    if (cast) return res.status(400).json(cast);
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/applications/:id/generate-followup
export const generateFollowUp = async (req, res) => {
  try {
    const userId = req.user._id;
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid application id" });
    }

    const application = await Application.findOne({ _id: req.params.id, userId }).populate("jobId");
    if (!application) return res.status(404).json({ error: "Application not found" });

    if (application.status !== "sent") {
      return res.status(400).json({
        error: `Follow-ups can only be generated for sent applications (this one is ${application.status})`,
      });
    }

    const job = application.jobId;
    if (!job) {
      return res
        .status(400)
        .json({ error: "The job for this application no longer exists" });
    }

    const existing = await Application.findOne({
      userId,
      followUpFor: application._id,
      status: { $in: EDITABLE_STATUSES },
    }).sort({ updatedAt: -1 });
    if (existing) return res.status(200).json(existing);

    const resume = await Resume.findOne({ _id: application.resumeId, userId });
    if (!resume) {
      return res
        .status(400)
        .json({ error: "The resume attached to this application no longer exists" });
    }

    const profile = (await Profile.findOne({ userId })) || {};
    const { subject, body, providerUsed } = await generateFollowUpEmail({
      job,
      application,
      profile,
      resume,
    });

    const draft = await Application.create({
      userId,
      jobId: job._id,
      resumeId: resume._id,
      subject,
      body,
      recipientEmail: application.recipientEmail || job.hrEmail,
      status: "draft",
      deliveryStatus: "NOT_SENT",
      providerUsed,
      isFollowUp: true,
      followUpFor: application._id,
      followUpDate: new Date(application.followUpDate || Date.now() + FOLLOW_UP_WINDOW_DAYS * DAY_MS),
    });

    return res.status(201).json(draft);
  } catch (error) {
    const cast = castError(error);
    if (cast) return res.status(400).json(cast);
    return res.status(500).json({ error: error.message });
  }
};

// PATCH /api/applications/:id/status — reply / interview / rejection tracking
export const updateApplicationStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status } = req.body || {};
    if (!OUTCOME_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ error: `status must be one of ${OUTCOME_STATUSES.join(", ")}` });
    }

    const application = await Application.findOne({ _id: req.params.id, userId });
    if (!application) return res.status(404).json({ error: "Application not found" });

    if (application.status !== "sent") {
      return res
        .status(400)
        .json({ error: `Only sent applications can be marked ${status}` });
    }

    application.status = status;
    await application.save();

    if (application.jobId) {
      await Job.findByIdAndUpdate(application.jobId, {
        $set: { status, outcomeStatus: status, lifecycleStatus: "SENT" },
      });
    }

    const populated = await application.populate([
      "jobId",
      { path: "resumeId", select: "-fileData" },
    ]);
    return res.json(populated);
  } catch (error) {
    const cast = castError(error);
    if (cast) return res.status(400).json(cast);
    return res.status(500).json({ error: error.message });
  }
};

const CSV_HEADERS = [
  "Company",
  "Role",
  "Recipient Email",
  "Type",
  "Status",
  "Match Score",
  "Sent At",
  "Follow-Up Date",
  "Subject",
];

const csvCell = (value) => {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const iso = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const PDF_COLUMNS = [
  { label: "Company", width: 140 },
  { label: "Role", width: 150 },
  { label: "Status", width: 70 },
  { label: "Sent", width: 80 },
  { label: "Follow-Up", width: 75 },
];

const pdfDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const pdfStatus = (value) => String(value || "—").replace(/_/g, " ");

// GET /api/applications/export-pdf
export const exportApplicationsPdf = async (req, res) => {
  try {
    const userId = req.user._id;
    const [applications, profile, statusGroups, totalJobs] = await Promise.all([
      Application.find({ userId }).populate("jobId").sort({ createdAt: -1 }).lean(),
      Profile.findOne({ userId }).lean(),
      Job.aggregate([
        { $match: { userId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Job.countDocuments({ userId }),
    ]);

    const counts = new Map(statusGroups.map((group) => [group._id, group.count]));
    const replied = counts.get("replied") || 0;
    const interviews = counts.get("interview") || 0;
    const rejected = counts.get("rejected") || 0;
    const sent = (counts.get("sent") || 0) + replied + interviews + rejected;
    const responseRate = sent
      ? `${Math.round(((replied + interviews) / sent) * 1000) / 10}%`
      : "0%";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="applications-report.pdf"`,
    );

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;

    doc.font("Helvetica-Bold").fontSize(20).fillColor("#111827").text("Applications Report");
    doc
      .moveDown(0.2)
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#6b7280")
      .text(
        `${profile?.fullName || "Candidate"}${
          profile?.headline ? ` · ${profile.headline}` : ""
        } · ${pdfDate(new Date())}`,
      );

    doc.moveDown(1);

    const kpis = [
      { label: "Total Jobs", value: totalJobs },
      { label: "Sent", value: sent },
      { label: "Replied", value: replied },
      { label: "Interviews", value: interviews },
      { label: "Response Rate", value: responseRate },
    ];
    const boxWidth = pageWidth / kpis.length;
    const boxTop = doc.y;

    kpis.forEach((kpi, index) => {
      const x = left + index * boxWidth;
      doc
        .roundedRect(x + 2, boxTop, boxWidth - 4, 52, 6)
        .fillAndStroke("#f9fafb", "#e5e7eb");
      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(16)
        .text(String(kpi.value), x + 10, boxTop + 9, { width: boxWidth - 20 });
      doc
        .fillColor("#6b7280")
        .font("Helvetica")
        .fontSize(8)
        .text(kpi.label.toUpperCase(), x + 10, boxTop + 32, { width: boxWidth - 20 });
    });

    doc.y = boxTop + 72;

    const drawTableHeader = () => {
      const y = doc.y;
      doc.rect(left, y, pageWidth, 20).fill("#f3f4f6");
      let x = left;
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#374151");
      for (const column of PDF_COLUMNS) {
        doc.text(column.label, x + 5, y + 6, { width: column.width - 10, lineBreak: false });
        x += column.width;
      }
      doc.y = y + 20;
      doc.fillColor("#111827").font("Helvetica").fontSize(8.5);
    };

    drawTableHeader();

    doc.font("Helvetica").fontSize(8.5);

    applications.forEach((application, index) => {
      if (doc.y > doc.page.height - 70) {
        doc.addPage();
        drawTableHeader();
      }

      const job = application.jobId || {};
      const row = [
        job.companyName || "Job removed",
        job.jobRole || "—",
        pdfStatus(application.status),
        pdfDate(application.sentAt),
        pdfDate(application.followUpDate),
      ];

      const rowTop = doc.y;
      let x = left;

      if (index % 2 === 1) {
        doc.rect(left, rowTop, pageWidth, 18).fill("#f9fafb");
      }

      doc.fillColor("#111827");
      row.forEach((value, columnIndex) => {
        const column = PDF_COLUMNS[columnIndex];
        doc.text(String(value), x + 5, rowTop + 5, {
          width: column.width - 10,
          height: 12,
          lineBreak: false,
          ellipsis: true,
        });
        x += column.width;
      });

      doc
        .moveTo(left, rowTop + 18)
        .lineTo(left + pageWidth, rowTop + 18)
        .lineWidth(0.4)
        .strokeColor("#e5e7eb")
        .stroke();

      doc.y = rowTop + 18;
    });

    if (!applications.length) {
      doc.moveDown(1).fillColor("#6b7280").text("No applications yet.");
    }

    doc
      .moveDown(1.5)
      .fontSize(8)
      .fillColor("#9ca3af")
      .text(`Generated ${pdfDate(new Date())} by Auto-Apply.`);

    doc.end();
  } catch (error) {
    if (res.headersSent) {
      // The PDF stream already started; nothing sensible to append.
      res.end();
      return;
    }
    return res.status(500).json({ error: error.message });
  }
};

// GET /api/applications/export-csv
export const exportApplicationsCsv = async (req, res) => {
  try {
    const applications = await Application.find({ userId: req.user._id })
      .populate("jobId")
      .sort({ createdAt: -1 })
      .lean();

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`,
    );

    res.write(`${CSV_HEADERS.join(",")}\r\n`);

    for (const application of applications) {
      const job = application.jobId || {};
      const row = [
        job.companyName,
        job.jobRole,
        application.recipientEmail || job.hrEmail,
        job.applicationType,
        application.status,
        job.matchScore ?? 0,
        iso(application.sentAt),
        iso(application.followUpDate),
        application.subject,
      ];
      res.write(`${row.map(csvCell).join(",")}\r\n`);
    }

    return res.end();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
