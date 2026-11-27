import fs from "node:fs";
import path from "node:path";
import Resume from "../models/Resume.js";
import { extractResumeText } from "../services/resumeParser.js";
import { ensureResumeOnDisk } from "../utils/resumeFile.js";

const titleFromFile = (fileName) => {
  const base = path.basename(fileName, path.extname(fileName));
  return base.replace(/[-_]+/g, " ").trim() || "Resume";
};

// POST /api/resumes
export const uploadResume = async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "No PDF uploaded. Send the file in a form field named 'file'." });
  }

  try {
    const ownerId = req.user._id;
    const totalExisting = await Resume.countDocuments({ userId: ownerId });
    let isDefault =
      req.body.isDefault === "true" ||
      req.body.isDefault === "on" ||
      req.body.isDefault === true;

    // First uploaded resume automatically becomes default unless user has another default
    if (totalExisting === 0) {
      isDefault = true;
    }

    let fileData = "";
    try {
      const fileBuffer = await fs.promises.readFile(req.file.path);
      fileData = fileBuffer.toString("base64");
    } catch (readErr) {
      console.warn(`[resumes] Could not buffer file ${req.file.path}: ${readErr.message}`);
    }

    let extractedText = "";
    let parsedAt = null;
    try {
      extractedText = await extractResumeText(req.file.path);
      parsedAt = new Date();
    } catch (error) {
      console.warn(`[resumes] Could not parse text from ${req.file.originalname}: ${error.message}`);
    }

    const resume = await Resume.create({
      userId: ownerId,
      title: (req.body.title || "").trim() || titleFromFile(req.file.originalname),
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileData,
      isDefault,
      extractedText,
      parsedAt,
      uploadedAt: new Date(),
    });

    if (isDefault) {
      await Resume.updateMany(
        { userId: ownerId, _id: { $ne: resume._id } },
        { $set: { isDefault: false } },
      );
    }

    const obj = resume.toObject();
    delete obj.fileData; // Omit large base64 payload from JSON response
    return res.status(201).json(obj);
  } catch (error) {
    fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(500).json({ error: error.message });
  }
};

// GET /api/resumes
export const getResumes = async (req, res) => {
  try {
    const resumes = await Resume.find({ userId: req.user._id })
      .select("-fileData")
      .sort({ uploadedAt: -1 })
      .lean();
    return res.json(resumes);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/resumes/:id/reparse — re-runs extraction on the stored PDF
export const reparseResume = async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user._id });
    if (!resume) return res.status(404).json({ error: "Resume not found" });

    const validFilePath = await ensureResumeOnDisk(resume);
    if (!validFilePath || !fs.existsSync(validFilePath)) {
      return res.status(400).json({
        error: `The PDF for this resume is missing (${resume.fileName}). Please re-upload it.`,
      });
    }

    let text;
    try {
      text = await extractResumeText(validFilePath);
    } catch (error) {
      return res
        .status(422)
        .json({ error: `Could not read text from this PDF: ${error.message}` });
    }

    resume.extractedText = text;
    resume.parsedAt = new Date();
    await resume.save();

    const obj = resume.toObject();
    delete obj.fileData;
    return res.json(obj);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid resume id" });
    }
    return res.status(500).json({ error: error.message });
  }
};

// PATCH /api/resumes/:id/default — marks one resume as the default
export const setDefaultResume = async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user._id }).select("-fileData");
    if (!resume) return res.status(404).json({ error: "Resume not found" });

    await Resume.updateMany(
      { userId: req.user._id, _id: { $ne: resume._id } },
      { $set: { isDefault: false } },
    );
    resume.isDefault = true;
    await resume.save();

    return res.json(resume);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid resume id" });
    }
    return res.status(500).json({ error: error.message });
  }
};

// DELETE /api/resumes/:id
export const deleteResume = async (req, res) => {
  try {
    const resume = await Resume.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!resume) return res.status(404).json({ error: "Resume not found" });

    if (resume.filePath) {
      await fs.promises.unlink(resume.filePath).catch(() => {});
    }

    return res.json({ message: "Resume deleted", id: resume._id });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid resume id" });
    }
    return res.status(500).json({ error: error.message });
  }
};
