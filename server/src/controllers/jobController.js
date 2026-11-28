import fs from "node:fs";
import csvParser from "csv-parser";
import mongoose from "mongoose";
import ImportBatch from "../models/ImportBatch.js";
import Job, {
  CONTACT_STATUSES,
  JOB_STATUSES,
  LIFECYCLE_STATUSES,
  WORK_ARRANGEMENTS,
  computeApplicationType,
  deriveContactStatus,
  deriveLifecycleFromJob,
} from "../models/Job.js";
import Profile from "../models/Profile.js";
import { computeMatch } from "../services/jobMatcher.js";
import { ensureResumeOnDisk, getResumeBuffer } from "../utils/resumeFile.js";
import {
  createDraftForJob,
  getQuota,
  queueApplication,
  resolveResume,
} from "./applicationController.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const FIELD_ALIASES = {
  companyName: ["companyname", "company", "employer", "organisation", "organization"],
  jobRole: ["jobrole", "role", "jobtitle", "title", "position", "designation"],
  hrEmail: [
    "hremail",
    "hrapplicationemail",
    "applicationemail",
    "hrcontactemail",
    "companyemail",
    "careersemail",
    "hremailaddress",
    "email",
    "hremailid",
    "contactemail",
    "recruiteremail",
  ],
  applyUrl: ["applyurl", "applylink", "applicationurl", "url", "link", "originalurl"],
  jobDescription: ["jobdescription", "jobdescriptionsummary", "description", "jd", "jobdetails", "summary"],
  location: ["location", "joblocation", "city", "place"],
  companyWebsite: ["companywebsite", "website", "companyurl", "careersite", "alternativesourceurls"],
  salary: ["salary", "ctc", "pay", "compensation", "package"],
  emailSource: ["emailsource", "emailsourceurl", "leadsource", "source"],
  experienceRequirement: ["experiencerequirement", "experience", "experiencerequired"],
  requiredSkills: ["requiredskills", "skills", "techstack"],
  workArrangement: ["workarrangement", "workmode", "remote"],
  sourcePlatform: ["source", "sourceplatform", "platform"],
  jobPostedAt: ["postingdate", "posteddate", "jobpostedat", "dateposted"],
};

const extractValidEmail = (raw) => {
  const cleaned = String(raw || "")
    .replace(/^mailto:/i, "")
    .split("?")[0]
    .trim();
  if (!cleaned) return "";
  const candidates = cleaned
    .split(/[\s,;|/]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  for (const candidate of candidates) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(candidate)) {
      return candidate;
    }
  }
  return "";
};

const normalizeHeader = (header) =>
  String(header || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const buildHeaderMap = (row) => {
  const map = {};
  for (const rawHeader of Object.keys(row)) {
    map[normalizeHeader(rawHeader)] = rawHeader;
  }
  return map;
};

const pick = (row, headerMap, field) => {
  for (const alias of FIELD_ALIASES[field]) {
    const rawHeader = headerMap[alias];
    if (!rawHeader) continue;
    const value = row[rawHeader];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
};

const dedupeKey = (companyName, jobRole, hrEmail) =>
  [companyName, jobRole, hrEmail]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");

const parseCsvFile = (filePath) =>
  new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const startOfUtcDay = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const endOfUtcDay = (date) => {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};

const buildDateRangeQuery = (datePreset, dateFrom, dateTo) => {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const todayEnd = endOfUtcDay(now);

  switch (datePreset) {
    case "today":
      return { $gte: todayStart, $lte: todayEnd };
    case "yesterday": {
      const yStart = new Date(todayStart.getTime() - DAY_MS);
      const yEnd = new Date(todayEnd.getTime() - DAY_MS);
      return { $gte: yStart, $lte: yEnd };
    }
    case "last_7_days":
      return { $gte: new Date(todayStart.getTime() - 6 * DAY_MS), $lte: todayEnd };
    case "last_30_days":
      return { $gte: new Date(todayStart.getTime() - 29 * DAY_MS), $lte: todayEnd };
    case "this_week": {
      const day = todayStart.getUTCDay(); // 0 Sun .. 6 Sat
      const diffToMonday = day === 0 ? 6 : day - 1;
      const weekStart = new Date(todayStart.getTime() - diffToMonday * DAY_MS);
      return { $gte: weekStart, $lte: todayEnd };
    }
    case "last_week": {
      const day = todayStart.getUTCDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const thisWeekStart = new Date(todayStart.getTime() - diffToMonday * DAY_MS);
      const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * DAY_MS);
      const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);
      return { $gte: lastWeekStart, $lte: lastWeekEnd };
    }
    case "this_month": {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { $gte: monthStart, $lte: todayEnd };
    }
    case "last_month": {
      const firstThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const lastMonthEnd = new Date(firstThisMonth.getTime() - 1);
      return { $gte: lastMonthStart, $lte: lastMonthEnd };
    }
    case "custom":
    default: {
      const range = {};
      if (dateFrom) {
        const parsedFrom = new Date(dateFrom);
        if (!Number.isNaN(parsedFrom.getTime())) range.$gte = startOfUtcDay(parsedFrom);
      }
      if (dateTo) {
        const parsedTo = new Date(dateTo);
        if (!Number.isNaN(parsedTo.getTime())) range.$lte = endOfUtcDay(parsedTo);
      }
      return Object.keys(range).length ? range : null;
    }
  }
};

export const computeJobSummary = async (userId) => {
  const [
    pendingVacancies,
    emailAvailable,
    emailNotFound,
    draftsReady,
    approvedReadyToSend,
    failedApplications,
  ] = await Promise.all([
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
  ]);

  return {
    pendingVacancies,
    emailAvailable,
    emailNotFound,
    draftsReady,
    approvedReadyToSend,
    failedApplications,
  };
};

// POST /api/jobs/import-csv
export const importJobsFromCsv = async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "No CSV uploaded. Send the file in a form field named 'file'." });
  }

  try {
    const ownerId = req.user._id;
    const rows = await parseCsvFile(req.file.path);

    if (!rows.length) {
      return res.status(400).json({ error: "The CSV file has no data rows" });
    }

    const [existingJobs, profile] = await Promise.all([
      Job.find({ userId: ownerId }, { companyName: 1, jobRole: 1, hrEmail: 1 }).lean(),
      Profile.findOne({ userId: ownerId }).lean(),
    ]);
    const profileSkills = profile?.skills || [];
    const seen = new Set(
      existingJobs.map((job) => dedupeKey(job.companyName, job.jobRole, job.hrEmail)),
    );

    const summary = {
      imported: 0,
      skippedDuplicates: 0,
      invalidRows: 0,
      totalProcessed: rows.length,
    };
    const docs = [];
    const errors = [];

    const batch = await ImportBatch.create({
      userId: ownerId,
      importType: "csv",
      fileName: req.file.originalname || "import.csv",
      sourceLabel: "CSV Upload",
      totalRecords: rows.length,
    });

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const headerMap = buildHeaderMap(row);

      const companyName = pick(row, headerMap, "companyName");
      const jobRole = pick(row, headerMap, "jobRole");
      let applyUrl = pick(row, headerMap, "applyUrl");
      let hrEmail = extractValidEmail(pick(row, headerMap, "hrEmail"));

      if (!hrEmail && /^mailto:/i.test(applyUrl)) {
        hrEmail = extractValidEmail(applyUrl);
      }
      if (/^mailto:/i.test(applyUrl)) {
        applyUrl = "";
      }

      if (!companyName || !jobRole) {
        summary.invalidRows += 1;
        if (errors.length < 50) {
          errors.push({
            rowIndex: i + 1,
            companyName: companyName || "",
            message: "Missing Company Name or Job Role",
          });
        }
        continue;
      }

      const applicationType = computeApplicationType(hrEmail, applyUrl);
      if (applicationType === "unknown") {
        summary.invalidRows += 1;
        if (errors.length < 50) {
          errors.push({
            rowIndex: i + 1,
            companyName,
            message: "Neither valid HR email nor Apply URL found",
          });
        }
        continue;
      }

      const key = dedupeKey(companyName, jobRole, hrEmail);
      if (seen.has(key)) {
        summary.skippedDuplicates += 1;
        continue;
      }
      seen.add(key);

      const jobDescription = pick(row, headerMap, "jobDescription");
      const location = pick(row, headerMap, "location");
      const rawSkills = pick(row, headerMap, "requiredSkills");
      const requiredSkills = rawSkills
        ? rawSkills.split(/[,;|]+/).map((s) => s.trim()).filter(Boolean)
        : [];
      const rawWork = pick(row, headerMap, "workArrangement").toLowerCase();
      const workArrangement = WORK_ARRANGEMENTS.includes(rawWork)
        ? rawWork
        : rawWork.includes("hybrid")
          ? "hybrid"
          : rawWork.includes("remote")
            ? "remote"
            : rawWork.includes("office") || rawWork.includes("on-site") || rawWork.includes("onsite")
              ? "office"
              : "unspecified";
      const rawPosted = pick(row, headerMap, "jobPostedAt");
      const parsedPosted = rawPosted ? new Date(rawPosted) : null;
      const jobPostedAt =
        parsedPosted && !Number.isNaN(parsedPosted.getTime()) ? parsedPosted : undefined;

      const { matchScore, matchedSkills } = computeMatch(
        { jobRole, jobDescription, location, requiredSkills },
        profileSkills,
      );
      const contactStatus = deriveContactStatus({ hrEmail });
      const lifecycleStatus = deriveLifecycleFromJob({
        status: "new",
        hrEmail,
        applyUrl,
        applicationType,
      });

      docs.push({
        userId: ownerId,
        importBatchId: batch._id,
        companyName,
        jobRole,
        hrEmail,
        applyUrl,
        jobDescription,
        location,
        companyWebsite: pick(row, headerMap, "companyWebsite"),
        salary: pick(row, headerMap, "salary"),
        emailSource: pick(row, headerMap, "emailSource"),
        experienceRequirement: pick(row, headerMap, "experienceRequirement"),
        requiredSkills,
        workArrangement,
        jobPostedAt,
        importType: "csv",
        sourcePlatform: pick(row, headerMap, "sourcePlatform") || "csv",
        applicationType,
        contactStatus,
        lifecycleStatus,
        status: "new",
        matchScore,
        matchedSkills,
        priorityScore: Math.min(120, Math.round(matchScore + (applicationType === "email" ? 20 : 0))),
      });
    }

    if (docs.length) await Job.insertMany(docs);
    summary.imported = docs.length;

    batch.importedCount = docs.length;
    batch.skippedDuplicates = summary.skippedDuplicates;
    batch.failedCount = summary.invalidRows;
    batch.errors = errors;
    await batch.save();

    return res.status(201).json({ ...summary, batchId: batch._id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  } finally {
    fs.promises.unlink(req.file.path).catch(() => {});
  }
};

const SORT_MAP = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  company_asc: { companyName: 1, createdAt: -1 },
  company_desc: { companyName: -1, createdAt: -1 },
  role_asc: { jobRole: 1, createdAt: -1 },
  updated_desc: { updatedAt: -1 },
  priority_desc: { priorityScore: -1, matchScore: -1, createdAt: -1 },
};

// GET /api/jobs — filtered, searchable, sortable, paginated vacancy query
export const getJobs = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      scope = "all",
      type,
      status,
      lifecycleStatus,
      contactFilter,
      dateField = "createdAt",
      datePreset,
      dateFrom,
      dateTo,
      company,
      jobTitle,
      role,
      location,
      experience,
      workArrangement,
      sourcePlatform,
      importType,
      resumeId,
      search,
      sort = "newest",
      page: rawPage,
      limit: rawLimit,
    } = req.query;

    const conditions = [{ userId }];

    // Scope separation: Pending vs All vs Archived
    if (scope === "pending") {
      conditions.push({
        lifecycleStatus: { $nin: ["SENT", "ARCHIVED"] },
        status: { $nin: ["sent", "replied", "interview", "rejected", "archived"] },
      });
    } else if (scope === "archived") {
      conditions.push({ lifecycleStatus: "ARCHIVED" });
    }

    if (type && type !== "all") {
      if (!["email", "portal", "unknown"].includes(type)) {
        return res.status(400).json({ error: "type must be email, portal or unknown" });
      }
      conditions.push({ applicationType: type });
    }

    // Contact availability filter
    if (contactFilter && contactFilter !== "all") {
      if (contactFilter === "email_available") {
        conditions.push({ applicationType: "email" });
      } else if (contactFilter === "email_not_available") {
        conditions.push({ applicationType: { $ne: "email" } });
      } else if (contactFilter === "requires_verification") {
        conditions.push({
          contactStatus: {
            $in: ["PUBLICLY_LISTED_UNVERIFIED", "MANUAL_REVIEW_REQUIRED", "INVALID_FORMAT"],
          },
        });
      } else if (contactFilter === "verified") {
        conditions.push({ contactStatus: "VERIFIED_PUBLIC_SOURCE" });
      }
    }

    // Lifecycle / Application status filter
    const requestedStatus = lifecycleStatus || status;
    if (requestedStatus && requestedStatus !== "all" && requestedStatus !== "ALL") {
      const normalized = String(requestedStatus).trim();
      if (normalized === "PENDING") {
        conditions.push({ lifecycleStatus: { $nin: ["SENT", "ARCHIVED"] } });
      } else if (normalized === "DRAFT_READY") {
        conditions.push({
          lifecycleStatus: { $in: ["EMAIL_DRAFT_READY", "AWAITING_APPROVAL"] },
        });
      } else if (normalized === "APPROVED_QUEUE") {
        conditions.push({
          lifecycleStatus: { $in: ["APPROVED", "QUEUED", "SENDING"] },
        });
      } else if (normalized === "FAILED") {
        conditions.push({
          lifecycleStatus: {
            $in: ["SEND_FAILED", "EMAIL_GENERATION_FAILED", "EXTRACTION_FAILED"],
          },
        });
      } else if (normalized.includes(",")) {
        const list = normalized.split(",").map((s) => s.trim()).filter(Boolean);
        conditions.push({ lifecycleStatus: { $in: list } });
      } else if (LIFECYCLE_STATUSES.includes(normalized)) {
        conditions.push({ lifecycleStatus: normalized });
      } else if (JOB_STATUSES.includes(normalized)) {
        conditions.push({ status: normalized });
      } else {
        return res.status(400).json({ error: `Invalid status filter: ${normalized}` });
      }
    }

    // Date filter (defaulting to createdAt import/creation timestamp)
    if (datePreset || dateFrom || dateTo) {
      const targetField = dateField === "jobPostedAt" ? "jobPostedAt" : "createdAt";
      const range = buildDateRangeQuery(datePreset || "custom", dateFrom, dateTo);
      if (range) {
        conditions.push({ [targetField]: range });
      }
    }

    if (company && String(company).trim()) {
      conditions.push({
        companyName: new RegExp(escapeRegex(String(company).trim()), "i"),
      });
    }
    const roleFilter = jobTitle || role;
    if (roleFilter && String(roleFilter).trim()) {
      conditions.push({
        jobRole: new RegExp(escapeRegex(String(roleFilter).trim()), "i"),
      });
    }
    if (location && String(location).trim()) {
      conditions.push({
        location: new RegExp(escapeRegex(String(location).trim()), "i"),
      });
    }
    if (experience && String(experience).trim()) {
      const expPat = new RegExp(escapeRegex(String(experience).trim()), "i");
      conditions.push({
        $or: [{ experienceRequirement: expPat }, { jobDescription: expPat }],
      });
    }
    if (workArrangement && workArrangement !== "all") {
      if (WORK_ARRANGEMENTS.includes(workArrangement)) {
        conditions.push({ workArrangement });
      }
    }
    if (sourcePlatform && sourcePlatform !== "all" && String(sourcePlatform).trim()) {
      conditions.push({
        sourcePlatform: new RegExp(escapeRegex(String(sourcePlatform).trim()), "i"),
      });
    }
    if (importType && importType !== "all") {
      conditions.push({ importType });
    }
    if (resumeId && resumeId !== "all" && mongoose.isValidObjectId(resumeId)) {
      conditions.push({ resumeIdUsed: resumeId });
    }

    if (search && String(search).trim()) {
      const pattern = new RegExp(escapeRegex(String(search).trim()), "i");
      conditions.push({
        $or: [
          { companyName: pattern },
          { jobRole: pattern },
          { hrEmail: pattern },
          { location: pattern },
          { applyUrl: pattern },
          { sourcePlatform: pattern },
        ],
      });
    }

    const query = conditions.length > 1 ? { $and: conditions } : conditions[0];
    const sortSpec = SORT_MAP[sort] || SORT_MAP.newest;

    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(rawLimit, 10) || 25));

    const [items, total, summary] = await Promise.all([
      Job.find(query)
        .sort(sortSpec)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Job.countDocuments(query),
      computeJobSummary(userId),
    ]);

    return res.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      summary,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// GET /api/jobs/summary
export const getJobSummary = async (req, res) => {
  try {
    const summary = await computeJobSummary(req.user._id);
    return res.json(summary);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// DELETE /api/jobs/:id
export const deleteJob = async (req, res) => {
  try {
    const job = await Job.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!job) return res.status(404).json({ error: "Job not found" });
    return res.json({ message: "Job deleted", id: job._id });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid job id" });
    }
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/jobs/bulk-delete
export const bulkDeleteJobs = async (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.jobIds) ? req.body.jobIds : [];
    const validIds = [...new Set(rawIds.filter((id) => mongoose.Types.ObjectId.isValid(id)))];
    if (validIds.length === 0) {
      return res.status(400).json({ error: "Provide at least one valid jobId to delete." });
    }

    const result = await Job.deleteMany({
      _id: { $in: validIds },
      userId: req.user._id,
    });

    return res.json({
      deletedCount: result.deletedCount || 0,
      ids: validIds,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// PATCH /api/jobs/:id — edit vacancy details cleanly (manual edits)
export const updateJob = async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, userId: req.user._id });
    if (!job) return res.status(404).json({ error: "Job not found" });

    const body = req.body || {};
    const stringFields = [
      "companyName",
      "jobRole",
      "hrName",
      "applyUrl",
      "jobPostUrl",
      "jobDescription",
      "location",
      "companyWebsite",
      "salary",
      "emailSource",
      "experienceRequirement",
      "employmentType",
      "sourcePlatform",
    ];

    for (const field of stringFields) {
      if (body[field] !== undefined) {
        job[field] = String(body[field] || "").trim();
      }
    }

    if (body.hrEmail !== undefined) {
      const email = String(body.hrEmail || "").trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return res.status(400).json({ error: "hrEmail is not a valid email address" });
      }
      job.hrEmail = email;
      if (email) {
        job.contactStatus = "PUBLICLY_LISTED_UNVERIFIED";
        if (["CONTACT_NOT_FOUND", "CONTACT_DISCOVERY", "PORTAL_APPLICATION_REQUIRED"].includes(job.lifecycleStatus)) {
          job.lifecycleStatus = "CONTACT_AVAILABLE";
        }
      } else {
        job.contactStatus = "NOT_FOUND";
      }
    }

    if (body.workArrangement !== undefined && WORK_ARRANGEMENTS.includes(body.workArrangement)) {
      job.workArrangement = body.workArrangement;
    }

    if (body.jobPostedAt !== undefined) {
      if (!body.jobPostedAt) {
        job.jobPostedAt = undefined;
      } else {
        const parsed = new Date(body.jobPostedAt);
        if (!Number.isNaN(parsed.getTime())) job.jobPostedAt = parsed;
      }
    }

    const profile = await Profile.findOne({ userId: req.user._id }).lean();
    const { matchScore, matchedSkills } = computeMatch(
      { jobRole: job.jobRole, jobDescription: job.jobDescription, location: job.location },
      profile?.skills || [],
    );
    job.matchScore = matchScore;
    job.matchedSkills = matchedSkills;

    await job.save();
    return res.json(job);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid job id" });
    }
    return res.status(500).json({ error: error.message });
  }
};

// PATCH /api/jobs/:id/archive
export const archiveJob = async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, userId: req.user._id });
    if (!job) return res.status(404).json({ error: "Job not found" });

    const archived = req.body?.archived !== false;
    if (archived) {
      job.lifecycleStatus = "ARCHIVED";
      job.status = "archived";
      job.archivedAt = new Date();
    } else {
      job.archivedAt = undefined;
      job.lifecycleStatus = deriveLifecycleFromJob({
        status: "new",
        hrEmail: job.hrEmail,
        applyUrl: job.applyUrl,
        applicationType: job.applicationType,
      });
      job.status = "new";
    }

    await job.save();
    return res.json(job);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid job id" });
    }
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/jobs/recalculate-scores — refresh every score after a profile edit
export const recalculateScores = async (req, res) => {
  try {
    const userId = req.user._id;
    const profile = await Profile.findOne({ userId }).lean();
    const skills = profile?.skills || [];

    const jobs = await Job.find(
      { userId },
      { jobRole: 1, jobDescription: 1, location: 1, applicationType: 1 },
    ).lean();
    if (!jobs.length) {
      return res.json({ updated: 0, profileSkills: skills.length, scored: 0 });
    }

    const operations = jobs.map((job) => {
      const { matchScore, matchedSkills } = computeMatch(job, skills);
      const priorityScore = Math.min(
        120,
        Math.round(matchScore + (job.applicationType === "email" ? 20 : 0)),
      );
      return {
        updateOne: {
          filter: { _id: job._id },
          update: { $set: { matchScore, matchedSkills, priorityScore } },
        },
      };
    });

    await Job.bulkWrite(operations);

    return res.json({
      updated: jobs.length,
      profileSkills: skills.length,
      scored: skills.length ? jobs.length : 0,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/jobs (and POST /api/jobs/manual)
export const createJob = async (req, res) => {
  try {
    const userId = req.user._id;
    const body = req.body || {};
    const companyName = String(body.companyName || "").trim();
    const jobRole = String(body.jobRole || "").trim();

    if (!companyName || !jobRole) {
      return res.status(400).json({ error: "companyName and jobRole are required" });
    }

    const rawEmail = String(body.hrEmail || "").trim().toLowerCase();
    if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawEmail)) {
      return res.status(400).json({ error: "hrEmail is not a valid email address" });
    }

    const applyUrl = String(body.applyUrl || "").trim();
    const applicationType = computeApplicationType(rawEmail, applyUrl);
    if (applicationType === "unknown") {
      return res
        .status(400)
        .json({ error: "Provide a valid HR email or an apply URL" });
    }

    const mode = String(body.mode || "save_only").trim();

    if (mode === "generate_draft" || mode === "auto_queue") {
      if (applicationType !== "email" || !rawEmail) {
        return res.status(400).json({
          error: "Only jobs with a valid HR email can generate an AI email draft or auto-queue an application",
        });
      }
    }

    const profile = await Profile.findOne({ userId }).lean();
    if (mode === "auto_queue" && !profile?.autoSendEnabled) {
      return res.status(403).json({
        error: "Automatic sending mode is disabled by default. Review and approve drafts manually, or enable Automatic Sending in Email Settings.",
      });
    }

    const existing = await Job.findOne({
      userId,
      companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i"),
      jobRole: new RegExp(`^${escapeRegex(jobRole)}$`, "i"),
      hrEmail: rawEmail,
    });
    if (existing) {
      return res.status(409).json({
        error: "This job already exists",
        jobId: existing._id,
      });
    }

    const { resumeId, tone, customNote } = body;
    let resolvedResume = null;
    if (mode === "generate_draft" || mode === "auto_queue") {
      const resolved = await resolveResume(resumeId, userId);
      if (resolved.error) {
        return res.status(resolved.status).json({ error: resolved.error });
      }
      resolvedResume = resolved.resume;

      const validFilePath = await ensureResumeOnDisk(resolvedResume);
      const resumeBuffer = getResumeBuffer(resolvedResume);
      if (!validFilePath && !resumeBuffer) {
        return res.status(400).json({
          error: `The resume file is missing (${resolvedResume.fileName}). Re-upload it and try again.`,
        });
      }
    }

    if (mode === "auto_queue") {
      const quota = await getQuota(userId);
      if (quota.sentToday + quota.queued >= quota.dailyLimit) {
        return res.status(429).json({
          error: `Daily limit reached: ${quota.sentToday} sent and ${quota.queued} queued against a limit of ${quota.dailyLimit}.`,
        });
      }
    }

    const jobDescription = String(body.jobDescription || "").trim();
    const location = String(body.location || "").trim();
    const { matchScore, matchedSkills } = computeMatch(
      { jobRole, jobDescription, location },
      profile?.skills || [],
    );

    const parsedPostedAt = body.jobPostedAt ? new Date(body.jobPostedAt) : null;
    const batch = await ImportBatch.create({
      userId,
      importType: "manual",
      sourceLabel: `${companyName} — ${jobRole}`,
      totalRecords: 1,
      importedCount: 1,
    });

    const job = await Job.create({
      userId,
      importBatchId: batch._id,
      companyName,
      jobRole,
      hrName: String(body.hrName || "").trim(),
      hrEmail: rawEmail,
      applyUrl,
      jobPostUrl: String(body.jobPostUrl || "").trim(),
      jobDescription,
      location,
      companyWebsite: String(body.companyWebsite || "").trim(),
      salary: String(body.salary || "").trim(),
      emailSource: String(body.emailSource || "").trim(),
      importType: "manual",
      sourcePlatform: String(body.sourcePlatform || "manual").trim(),
      experienceRequirement: String(body.experienceRequirement || "").trim(),
      employmentType: String(body.employmentType || "").trim(),
      workArrangement: WORK_ARRANGEMENTS.includes(body.workArrangement)
        ? body.workArrangement
        : "unspecified",
      jobPostedAt:
        parsedPostedAt && !Number.isNaN(parsedPostedAt.getTime()) ? parsedPostedAt : undefined,
      applicationType,
      contactStatus: deriveContactStatus({ hrEmail: rawEmail }),
      lifecycleStatus: deriveLifecycleFromJob({
        status: "new",
        hrEmail: rawEmail,
        applyUrl,
        applicationType,
      }),
      matchScore,
      matchedSkills,
    });

    if (mode === "generate_draft") {
      const { application } = await createDraftForJob({
        userId,
        job,
        profile,
        resume: resolvedResume,
        tone,
        customNote,
      });
      return res.status(201).json({ job, application });
    }

    if (mode === "auto_queue") {
      const { application } = await createDraftForJob({
        userId,
        job,
        profile,
        resume: resolvedResume,
        tone,
        customNote,
      });

      application.jobId = job;
      application.resumeId = resolvedResume;
      application.approvedAt = new Date();
      const outcome = await queueApplication(application);

      if (outcome.error) {
        return res.status(outcome.status || 500).json({ error: outcome.error, job, application });
      }

      return res.status(201).json({
        job,
        application: outcome.application || application,
        queued: true,
      });
    }

    return res.status(201).json({ job, ...job.toObject() });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// GET /api/jobs/upcoming-interviews
export const upcomingInterviews = async (req, res) => {
  try {
    const jobs = await Job.find({
      userId: req.user._id,
      "interview.date": { $gte: new Date() },
    })
      .sort({ "interview.date": 1 })
      .lean();

    return res.json(jobs);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// PATCH /api/jobs/:id/interview
const INTERVIEW_FIELDS = ["meetingUrl", "round", "notes"];

export const updateInterview = async (req, res) => {
  try {
    const body = req.body || {};
    const parsed = new Date(body.date);
    if (!body.date || Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ error: "A valid interview date is required" });
    }

    const job = await Job.findOne({ _id: req.params.id, userId: req.user._id });
    if (!job) return res.status(404).json({ error: "Job not found" });

    job.interview = {
      ...(job.interview?.toObject ? job.interview.toObject() : job.interview),
      date: parsed,
    };
    for (const field of INTERVIEW_FIELDS) {
      if (body[field] !== undefined) {
        job.interview[field] = String(body[field] || "").trim();
      }
    }
    job.status = "interview";
    job.outcomeStatus = "interview";
    job.lifecycleStatus = "SENT";

    await job.save();
    return res.json(job);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid job id" });
    }
    return res.status(500).json({ error: error.message });
  }
};

// PATCH /api/jobs/:id/status
export const updateJobStatus = async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!JOB_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ error: `status must be one of ${JOB_STATUSES.join(", ")}` });
    }

    const job = await Job.findOne({ _id: req.params.id, userId: req.user._id });
    if (!job) return res.status(404).json({ error: "Job not found" });

    // Prevent marking portal-only jobs as email "sent" falsely
    if (job.applicationType === "portal" && status === "sent") {
      return res.status(400).json({
        error: "Portal applications cannot be marked as email sent automatically. Use status=archived or track portal submission separately.",
      });
    }

    job.status = status;
    if (["replied", "interview", "rejected"].includes(status)) {
      job.outcomeStatus = status;
    }
    job.lifecycleStatus = deriveLifecycleFromJob({
      status,
      hrEmail: job.hrEmail,
      applyUrl: job.applyUrl,
      applicationType: job.applicationType,
    });
    if (status === "archived") job.archivedAt = new Date();

    await job.save();

    return res.json(job);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid job id" });
    }
    return res.status(500).json({ error: error.message });
  }
};
