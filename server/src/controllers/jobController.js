import fs from "node:fs";
import csvParser from "csv-parser";
import Job, {
  JOB_STATUSES,
  computeApplicationType,
  isValidEmail,
} from "../models/Job.js";
import Profile from "../models/Profile.js";
import { computeMatch } from "../services/jobMatcher.js";

// Column names vary between exports, so every header is normalised to
// lowercase alphanumerics and matched against a list of accepted aliases.
const FIELD_ALIASES = {
  companyName: ["companyname", "company", "employer", "organisation", "organization"],
  jobRole: ["jobrole", "role", "jobtitle", "title", "position", "designation"],
  hrEmail: ["hremail", "email", "hremailid", "contactemail", "recruiteremail"],
  applyUrl: ["applyurl", "applylink", "applicationurl", "url", "link"],
  jobDescription: ["jobdescription", "description", "jd", "jobdetails"],
  location: ["location", "joblocation", "city", "place"],
  companyWebsite: ["companywebsite", "website", "companyurl", "careersite"],
  salary: ["salary", "ctc", "pay", "compensation", "package"],
  emailSource: ["emailsource", "source", "leadsource", "emailsourceurl"],
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

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// POST /api/jobs/import-csv
export const importJobsFromCsv = async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "No CSV uploaded. Send the file in a form field named 'file'." });
  }

  try {
    const rows = await parseCsvFile(req.file.path);

    if (!rows.length) {
      return res.status(400).json({ error: "The CSV file has no data rows" });
    }

    const [existingJobs, profile] = await Promise.all([
      Job.find({}, { companyName: 1, jobRole: 1, hrEmail: 1 }).lean(),
      Profile.findOne().lean(),
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

    for (const row of rows) {
      const headerMap = buildHeaderMap(row);

      const companyName = pick(row, headerMap, "companyName");
      const jobRole = pick(row, headerMap, "jobRole");
      const applyUrl = pick(row, headerMap, "applyUrl");
      let hrEmail = pick(row, headerMap, "hrEmail").toLowerCase();

      // A row without a company or a role cannot be actioned.
      if (!companyName || !jobRole) {
        summary.invalidRows += 1;
        continue;
      }

      // A malformed address is dropped rather than stored, so the row still
      // imports when there is a portal link to fall back on.
      if (hrEmail && !isValidEmail(hrEmail)) hrEmail = "";

      const applicationType = computeApplicationType(hrEmail, applyUrl);
      if (applicationType === "unknown") {
        summary.invalidRows += 1;
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
      const { matchScore, matchedSkills } = computeMatch(
        { jobRole, jobDescription, location },
        profileSkills,
      );

      docs.push({
        companyName,
        jobRole,
        hrEmail,
        applyUrl,
        jobDescription,
        location,
        companyWebsite: pick(row, headerMap, "companyWebsite"),
        salary: pick(row, headerMap, "salary"),
        emailSource: pick(row, headerMap, "emailSource"),
        applicationType,
        matchScore,
        matchedSkills,
      });
    }

    if (docs.length) await Job.insertMany(docs);
    summary.imported = docs.length;

    return res.status(201).json(summary);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  } finally {
    // The uploaded CSV is only needed while parsing.
    fs.promises.unlink(req.file.path).catch(() => {});
  }
};

// GET /api/jobs?type=email&status=sent&search=acme
export const getJobs = async (req, res) => {
  try {
    const { type, status, search } = req.query;
    const query = {};

    if (type && type !== "all") {
      if (!["email", "portal", "unknown"].includes(type)) {
        return res.status(400).json({ error: "type must be email, portal or unknown" });
      }
      query.applicationType = type;
    }

    if (status && status !== "all") query.status = status;

    if (search && String(search).trim()) {
      const pattern = new RegExp(escapeRegex(String(search).trim()), "i");
      query.$or = [
        { companyName: pattern },
        { jobRole: pattern },
        { hrEmail: pattern },
        { location: pattern },
        { applyUrl: pattern },
      ];
    }

    const jobs = await Job.find(query).sort({ createdAt: -1 }).lean();
    return res.json(jobs);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// DELETE /api/jobs/:id
export const deleteJob = async (req, res) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    return res.json({ message: "Job deleted", id: job._id });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid job id" });
    }
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/jobs/recalculate-scores — refresh every score after a profile edit
export const recalculateScores = async (_req, res) => {
  try {
    const profile = await Profile.findOne().lean();
    const skills = profile?.skills || [];

    const jobs = await Job.find({}, { jobRole: 1, jobDescription: 1, location: 1 }).lean();
    if (!jobs.length) {
      return res.json({ updated: 0, profileSkills: skills.length, scored: 0 });
    }

    const operations = jobs.map((job) => {
      const { matchScore, matchedSkills } = computeMatch(job, skills);
      return {
        updateOne: {
          filter: { _id: job._id },
          update: { $set: { matchScore, matchedSkills } },
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

// POST /api/jobs — add one vacancy by hand, scored like an imported row
export const createJob = async (req, res) => {
  try {
    const body = req.body || {};
    const companyName = String(body.companyName || "").trim();
    const jobRole = String(body.jobRole || "").trim();

    if (!companyName || !jobRole) {
      return res.status(400).json({ error: "companyName and jobRole are required" });
    }

    const rawEmail = String(body.hrEmail || "").trim().toLowerCase();
    if (rawEmail && !isValidEmail(rawEmail)) {
      return res.status(400).json({ error: "hrEmail is not a valid email address" });
    }

    const applyUrl = String(body.applyUrl || "").trim();
    const applicationType = computeApplicationType(rawEmail, applyUrl);
    if (applicationType === "unknown") {
      return res
        .status(400)
        .json({ error: "Provide a valid HR email or an apply URL" });
    }

    const existing = await Job.findOne({
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

    const profile = await Profile.findOne().lean();
    const jobDescription = String(body.jobDescription || "").trim();
    const location = String(body.location || "").trim();
    const { matchScore, matchedSkills } = computeMatch(
      { jobRole, jobDescription, location },
      profile?.skills || [],
    );

    const job = await Job.create({
      companyName,
      jobRole,
      hrEmail: rawEmail,
      applyUrl,
      jobDescription,
      location,
      companyWebsite: String(body.companyWebsite || "").trim(),
      salary: String(body.salary || "").trim(),
      emailSource: String(body.emailSource || "").trim(),
      applicationType,
      matchScore,
      matchedSkills,
    });

    return res.status(201).json(job);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// GET /api/jobs/upcoming-interviews
export const upcomingInterviews = async (_req, res) => {
  try {
    const jobs = await Job.find({ "interview.date": { $gte: new Date() } })
      .sort({ "interview.date": 1 })
      .lean();

    return res.json(jobs);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// PATCH /api/jobs/:id/interview — saving details also advances the job
const INTERVIEW_FIELDS = ["meetingUrl", "round", "notes"];

export const updateInterview = async (req, res) => {
  try {
    const body = req.body || {};
    const parsed = new Date(body.date);
    if (!body.date || Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ error: "A valid interview date is required" });
    }

    const job = await Job.findById(req.params.id);
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

    await job.save();
    return res.json(job);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid job id" });
    }
    return res.status(500).json({ error: error.message });
  }
};

// PATCH /api/jobs/:id/status — manual tracking, e.g. marking a portal job sent
export const updateJobStatus = async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!JOB_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ error: `status must be one of ${JOB_STATUSES.join(", ")}` });
    }

    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    job.status = status;
    await job.save();

    return res.json(job);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid job id" });
    }
    return res.status(500).json({ error: error.message });
  }
};
