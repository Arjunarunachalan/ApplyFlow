import mongoose from "mongoose";

const resumeSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  fileName: { type: String, required: true, trim: true },
  filePath: { type: String, required: true, trim: true },
  isDefault: { type: Boolean, default: false },
  // Clean text taken from the PDF; the AI generator treats it as the only
  // source of truth for skills, projects and experience.
  extractedText: { type: String, default: "" },
  parsedAt: { type: Date },
  uploadedAt: { type: Date, default: Date.now },
});

resumeSchema.index({ uploadedAt: -1 });

export const Resume =
  mongoose.models.Resume || mongoose.model("Resume", resumeSchema);

export default Resume;
