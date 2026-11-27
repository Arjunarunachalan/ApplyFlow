import crypto from "node:crypto";
import mongoose from "mongoose";
import ImportBatch from "../models/ImportBatch.js";
import Job, {
  WORK_ARRANGEMENTS,
  computeApplicationType,
  deriveContactStatus,
  deriveLifecycleFromJob,
} from "../models/Job.js";
import Profile from "../models/Profile.js";
import VacancyScreenshot from "../models/VacancyScreenshot.js";
import { computeMatch } from "../services/jobMatcher.js";
import {
  extractVacancyFromScreenshots,
  validateImageMagicBytes,
} from "../services/visionExtractor.js";

const MAX_SESSION_SCREENSHOTS = 10;

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function getRetentionDate() {
  const hours = Number(process.env.SCREENSHOT_RETENTION_HOURS) || 72;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function serializeScreenshotMeta(doc) {
  return {
    _id: doc._id,
    sessionId: doc.sessionId,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    source: doc.source,
    orderIndex: doc.orderIndex,
    createdAt: doc.createdAt,
    imageUrl: `/api/imports/screenshots/${doc._id}/image`,
  };
}

export async function uploadScreenshots(req, res, next) {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ error: "Please attach or paste at least one PNG, JPG, JPEG, or WEBP screenshot." });
    }

    const sessionId = String(req.body?.sessionId || "").trim() || crypto.randomUUID();
    const defaultSource = req.body?.source === "paste" ? "paste" : "upload";

    let perFileSources = [];
    if (typeof req.body?.sources === "string" && req.body.sources.trim()) {
      try {
        const parsed = JSON.parse(req.body.sources);
        if (Array.isArray(parsed)) perFileSources = parsed;
      } catch {
        perFileSources = [];
      }
    }

    const existing = await VacancyScreenshot.find({
      userId: req.user._id,
      sessionId,
    })
      .select("orderIndex")
      .sort({ orderIndex: -1 })
      .lean();

    if (existing.length + files.length > MAX_SESSION_SCREENSHOTS) {
      return res.status(400).json({
        error: `A single vacancy import session supports at most ${MAX_SESSION_SCREENSHOTS} screenshots.`,
      });
    }

    const validated = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const detectedMime = validateImageMagicBytes(file.buffer);
      if (!detectedMime) {
        return res.status(400).json({
          error: `Unsupported or invalid image file "${file.originalname || `image-${i + 1}`}". Only valid PNG, JPG, JPEG, and WEBP images are accepted.`,
        });
      }
      const source =
        perFileSources[i] === "paste" || perFileSources[i] === "upload"
          ? perFileSources[i]
          : defaultSource;
      validated.push({ file, detectedMime, source });
    }

    let nextOrder = existing.length > 0 ? existing[0].orderIndex + 1 : 0;
    const expiresAt = getRetentionDate();

    const docsToCreate = validated.map(({ file, detectedMime, source }) => {
      const doc = {
        userId: req.user._id,
        sessionId,
        originalName: file.originalname || `screenshot-${nextOrder + 1}.${detectedMime.split("/")[1]}`,
        mimeType: detectedMime,
        sizeBytes: file.size || file.buffer.length,
        source,
        orderIndex: nextOrder,
        fileData: file.buffer,
        expiresAt,
      };
      nextOrder += 1;
      return doc;
    });

    const created = await VacancyScreenshot.insertMany(docsToCreate);
    const allInSession = await VacancyScreenshot.find({
      userId: req.user._id,
      sessionId,
    })
      .select("-fileData")
      .sort({ orderIndex: 1, createdAt: 1 })
      .lean();

    return res.status(201).json({
      sessionId,
      addedCount: created.length,
      screenshots: allInSession.map(serializeScreenshotMeta),
    });
  } catch (err) {
    return next(err);
  }
}

export async function getScreenshotImage(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid screenshot id." });
    }

    const doc = await VacancyScreenshot.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!doc || !doc.fileData) {
      return res.status(404).json({ error: "Screenshot not found." });
    }

    res.setHeader("Content-Type", doc.mimeType || "image/png");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(doc.fileData);
  } catch (err) {
    return next(err);
  }
}

export async function deleteScreenshot(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid screenshot id." });
    }

    const deleted = await VacancyScreenshot.findOneAndDelete({
      _id: id,
      userId: req.user._id,
    }).select("sessionId");

    if (!deleted) {
      return res.status(404).json({ error: "Screenshot not found." });
    }

    const remaining = await VacancyScreenshot.find({
      userId: req.user._id,
      sessionId: deleted.sessionId,
    })
      .select("-fileData")
      .sort({ orderIndex: 1, createdAt: 1 });

    await Promise.all(
      remaining.map((doc, idx) => {
        if (doc.orderIndex === idx) return Promise.resolve();
        doc.orderIndex = idx;
        return doc.save();
      })
    );

    return res.json({
      deleted: true,
      id,
      sessionId: deleted.sessionId,
      screenshots: remaining.map(serializeScreenshotMeta),
    });
  } catch (err) {
    return next(err);
  }
}

export async function cancelScreenshotSession(req, res, next) {
  try {
    const sessionId = String(req.params.sessionId || "").trim();
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required." });
    }

    const result = await VacancyScreenshot.deleteMany({
      userId: req.user._id,
      sessionId,
      vacancyId: null,
    });

    return res.json({
      cancelled: true,
      sessionId,
      deletedCount: result.deletedCount || 0,
    });
  } catch (err) {
    return next(err);
  }
}

export async function reorderScreenshots(req, res, next) {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];

    if (!sessionId || orderedIds.length === 0) {
      return res.status(400).json({ error: "sessionId and orderedIds are required." });
    }

    const docs = await VacancyScreenshot.find({
      userId: req.user._id,
      sessionId,
    }).select("-fileData");

    const byId = new Map(docs.map((d) => [String(d._id), d]));
    const updates = [];
    let index = 0;

    for (const id of orderedIds) {
      const doc = byId.get(String(id));
      if (!doc) continue;
      if (doc.orderIndex !== index) {
        doc.orderIndex = index;
        updates.push(doc.save());
      }
      byId.delete(String(id));
      index += 1;
    }

    for (const leftover of byId.values()) {
      if (leftover.orderIndex !== index) {
        leftover.orderIndex = index;
        updates.push(leftover.save());
      }
      index += 1;
    }

    await Promise.all(updates);

    const updated = await VacancyScreenshot.find({
      userId: req.user._id,
      sessionId,
    })
      .select("-fileData")
      .sort({ orderIndex: 1, createdAt: 1 })
      .lean();

    return res.json({
      sessionId,
      screenshots: updated.map(serializeScreenshotMeta),
    });
  } catch (err) {
    return next(err);
  }
}

export async function extractFromSession(req, res, next) {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required." });
    }

    const screenshots = await VacancyScreenshot.find({
      userId: req.user._id,
      sessionId,
    }).sort({ orderIndex: 1, createdAt: 1 });

    if (screenshots.length === 0) {
      return res.status(404).json({
        error: "No screenshots found for this import session. Please paste or upload at least one screenshot.",
      });
    }

    const extracted = await extractVacancyFromScreenshots(screenshots);

    return res.json({
      sessionId,
      extracted,
    });
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message,
        code: err.code || "EXTRACTION_FAILED",
      });
    }
    return next(err);
  }
}

export async function confirmScreenshotVacancy(req, res, next) {
  try {
    const body = req.body || {};
    const sessionId = String(body.sessionId || "").trim();
    const companyName = String(body.companyName || "").trim();
    const jobRole = String(body.jobRole || "").trim();
    const hrEmail = String(body.hrEmail || "").trim().toLowerCase();
    const applyUrl = String(body.applyUrl || "").trim();

    if (!companyName || !jobRole) {
      return res.status(400).json({
        error: "Company Name and Job Role are required before saving the vacancy.",
      });
    }

    if (hrEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hrEmail)) {
      return res.status(400).json({ error: "Please enter a valid HR email address." });
    }

    if (!hrEmail && !applyUrl) {
      return res.status(400).json({
        error: "Provide at least an HR Email or an Apply URL so you can act on this vacancy.",
      });
    }

    // Duplicate check scoped to current user
    const duplicateFilter = {
      userId: req.user._id,
      companyName: { $regex: `^${escapeRegex(companyName)}$`, $options: "i" },
      jobRole: { $regex: `^${escapeRegex(jobRole)}$`, $options: "i" },
    };
    if (hrEmail) {
      duplicateFilter.hrEmail = hrEmail;
    } else {
      duplicateFilter.applyUrl = applyUrl;
    }

    const existing = await Job.findOne(duplicateFilter).select("_id companyName jobRole").lean();
    if (existing) {
      return res.status(409).json({
        error: `A vacancy for ${existing.jobRole} at ${existing.companyName} already exists.`,
        existingJobId: existing._id,
      });
    }

    const requiredSkills = Array.isArray(body.requiredSkills)
      ? body.requiredSkills.map((s) => String(s).trim()).filter(Boolean)
      : typeof body.requiredSkills === "string"
        ? body.requiredSkills.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
        : [];

    const workArrangement = WORK_ARRANGEMENTS.includes(body.workArrangement)
      ? body.workArrangement
      : "unspecified";

    const jobDescription = String(body.jobDescription || "").trim();
    const profile = await Profile.findOne({ userId: req.user._id }).select("skills").lean();
    const { matchScore, matchedSkills } = computeMatch(
      { companyName, jobRole, jobDescription, requiredSkills },
      profile?.skills || []
    );

    const sessionShots = sessionId
      ? await VacancyScreenshot.find({ userId: req.user._id, sessionId })
          .select("_id originalName")
          .sort({ orderIndex: 1 })
          .lean()
      : [];

    const batch = await ImportBatch.create({
      userId: req.user._id,
      importType: "screenshot",
      fileName: sessionShots[0]?.originalName || "screenshot-import",
      sourceLabel: `Quick Apply (${sessionShots.length || 1} screenshot${sessionShots.length === 1 ? "" : "s"})`,
      totalRecords: 1,
      importedCount: 1,
      skippedDuplicates: 0,
      failedCount: 0,
    });

    const applicationType = computeApplicationType(hrEmail, applyUrl);
    const contactStatus = deriveContactStatus({ hrEmail });
    const lifecycleStatus = deriveLifecycleFromJob({
      status: "new",
      hrEmail,
      applyUrl,
      applicationType,
    });

    const job = await Job.create({
      userId: req.user._id,
      importBatchId: batch._id,
      importType: "screenshot",
      companyName,
      jobRole,
      department: String(body.department || "").trim(),
      location: String(body.location || "").trim(),
      workArrangement,
      employmentType: String(body.employmentType || "").trim(),
      experienceRequired: String(body.experienceRequired || "").trim(),
      salary: String(body.salary || "").trim(),
      hrEmail,
      applyUrl,
      companyWebsite: String(body.companyWebsite || "").trim(),
      requiredSkills,
      jobDescription,
      applicationDeadline: String(body.applicationDeadline || "").trim(),
      emailSource: hrEmail ? "screenshot" : "",
      applicationType,
      contactStatus,
      lifecycleStatus,
      status: "new",
      matchScore,
      matchedSkills,
      extractionConfidence:
        body.extractionConfidence && typeof body.extractionConfidence === "object"
          ? body.extractionConfidence
          : {},
      extractionConflicts: Array.isArray(body.extractionConflicts) ? body.extractionConflicts : [],
      userEditedFields: Array.isArray(body.userEditedFields)
        ? body.userEditedFields.map((f) => String(f)).filter(Boolean)
        : [],
    });

    if (sessionShots.length > 0) {
      await VacancyScreenshot.updateMany(
        {
          userId: req.user._id,
          sessionId,
        },
        {
          $set: {
            vacancyId: job._id,
            importBatchId: batch._id,
            expiresAt: null,
          },
        }
      );
    }

    return res.status(201).json({
      job,
      importBatch: batch,
      screenshotCount: sessionShots.length,
    });
  } catch (err) {
    return next(err);
  }
}
