import mongoose from "mongoose";

const resumeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  title: { type: String, required: true, trim: true },
  fileName: { type: String, required: true, trim: true },
  filePath: { type: String, required: true, trim: true },
  isDefault: { type: Boolean, default: false },
  // Base64-encoded PDF file data stored in MongoDB so the file survives
  // ephemeral serverless container recycles and disk wipes.
  fileData: { type: String, default: "" },
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
