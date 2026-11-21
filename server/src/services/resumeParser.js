/**
 * PDF resume text extraction.
 *
 * The AI generator may only talk about what is in the resume, so uploads are
 * parsed once and the cleaned text is stored on the Resume document. The text
 * is trimmed to a token budget: enough to cover skills, projects and history,
 * small enough to keep the prompt predictable.
 */

import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
import Resume from "../models/Resume.js";

export const MAX_RESUME_CHARS = 6000;
// Below this the PDF is almost certainly a scan with no text layer.
const MIN_RESUME_CHARS = 40;

const LIGATURES = [
  [/\uFB00/g, "ff"],
  [/\uFB01/g, "fi"],
  [/\uFB02/g, "fl"],
  [/\uFB03/g, "ffi"],
  [/\uFB04/g, "ffl"],
];

// PDF text arrives with hard wraps, stray spaces and non-breaking characters.
// Collapse runs of whitespace but keep line starts so sections stay readable.
export const cleanResumeText = (raw) => {
  let text = String(raw || "")
    .replace(/\0/g, "")
    .replace(/\f/g, "\n")
    .replace(/\r\n?/g, "\n");
  for (const [pattern, replacement] of LIGATURES) text = text.replace(pattern, replacement);

  return text
    .replace(/[\u00a0\u2007\u202f\u200b]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const clipToBudget = (text, maxChars) => {
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars);
  const boundary = Math.max(clipped.lastIndexOf("\n"), clipped.lastIndexOf(". "));
  return (boundary > maxChars * 0.8 ? clipped.slice(0, boundary) : clipped).trim();
};

/**
 * extractResumeText(filePath) -> clean plain text, at most MAX_RESUME_CHARS.
 * Throws when the file cannot be read or has no text layer, so the caller can
 * report a useful message instead of storing an empty string.
 */
export const extractResumeText = async (filePath, { maxChars = MAX_RESUME_CHARS } = {}) => {
  if (!filePath) throw new Error("No resume file path provided");

  const bytes = await readFile(filePath);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  const pageText = Array.isArray(text) ? text.join("\n\n") : text;
  const cleaned = cleanResumeText(pageText);

  if (cleaned.length < MIN_RESUME_CHARS) {
    throw new Error("No readable text found in this PDF (it may be a scanned image)");
  }

  return clipToBudget(cleaned, maxChars);
};

/**
 * Returns the stored resume text, parsing and saving it first when missing.
 * Never throws: a resume that cannot be read must not block a draft, the
 * generator simply works from the profile fields alone.
 */
export const ensureResumeText = async (resume) => {
  if (!resume) return "";

  let doc = resume;
  if (typeof resume === "string" || (resume && !resume.filePath && resume._id)) {
    const id = typeof resume === "string" ? resume : resume._id;
    const found = await Resume.findById(id);
    if (found) doc = found;
  }

  const existing = typeof doc.extractedText === "string" ? doc.extractedText.trim() : "";
  if (existing) return existing;
  if (!doc.filePath) return "";

  try {
    const text = await extractResumeText(doc.filePath);
    doc.extractedText = text;
    doc.parsedAt = new Date();
    if (typeof doc.save === "function") {
      await doc.save();
    } else if (doc._id) {
      await Resume.findByIdAndUpdate(doc._id, {
        extractedText: text,
        parsedAt: doc.parsedAt,
      });
    }
    return text;
  } catch (error) {
    console.warn(
      `[resumeParser] Could not parse ${doc.fileName || doc.filePath}: ${error.message}`,
    );
    return "";
  }
};

export default { extractResumeText, ensureResumeText, cleanResumeText, MAX_RESUME_CHARS };
