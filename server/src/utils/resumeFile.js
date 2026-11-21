import fs from "node:fs";
import path from "node:path";
import { RESUMES_DIR } from "../middleware/upload.js";

/**
 * Gets a Buffer of the resume PDF, whether stored in MongoDB as base64 fileData
 * or on disk at resume.filePath.
 */
export const getResumeBuffer = (resume) => {
  if (!resume) return null;

  if (resume.fileData) {
    try {
      return Buffer.from(resume.fileData, "base64");
    } catch (err) {
      console.warn(`[resumeFile] Failed to decode base64 fileData: ${err.message}`);
    }
  }

  if (resume.filePath && fs.existsSync(resume.filePath)) {
    try {
      return fs.readFileSync(resume.filePath);
    } catch (err) {
      console.warn(`[resumeFile] Failed to read filePath ${resume.filePath}: ${err.message}`);
    }
  }

  return null;
};

/**
 * Ensures the resume file exists on disk.
 * In serverless (Vercel) environments where /tmp is wiped between invocations,
 * this reconstitutes the PDF from resume.fileData onto disk.
 */
export const ensureResumeOnDisk = async (resume) => {
  if (!resume) return null;

  if (resume.filePath && fs.existsSync(resume.filePath)) {
    return resume.filePath;
  }

  const buffer = getResumeBuffer(resume);
  if (!buffer || buffer.length === 0) {
    return null;
  }

  try {
    fs.mkdirSync(RESUMES_DIR, { recursive: true });
    const safeName = (resume.fileName || "resume.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    const targetPath = path.join(RESUMES_DIR, `${resume._id || Date.now()}-${safeName}`);
    fs.writeFileSync(targetPath, buffer);

    resume.filePath = targetPath;
    if (typeof resume.save === "function") {
      await resume.save().catch((err) => {
        console.warn(`[resumeFile] Could not update resume.filePath in DB: ${err.message}`);
      });
    }

    return targetPath;
  } catch (err) {
    console.error(`[resumeFile] Error writing resume to disk: ${err.message}`);
    return null;
  }
};
