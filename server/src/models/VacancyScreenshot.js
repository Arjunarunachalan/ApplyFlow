import mongoose from "mongoose";

export const ALLOWED_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];

const vacancyScreenshotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    vacancyId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", index: true },
    importBatchId: { type: mongoose.Schema.Types.ObjectId, ref: "ImportBatch" },
    originalName: { type: String, trim: true, default: "screenshot.png" },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    source: { type: String, enum: ["upload", "paste"], default: "upload" },
    orderIndex: { type: Number, default: 0 },
    fileData: { type: Buffer, required: true },
    expiresAt: { type: Date, index: true },
  },
  { timestamps: true },
);

// TTL cleanup can also be triggered explicitly by retention cleanup or MongoDB TTL index
vacancyScreenshotSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VacancyScreenshot =
  mongoose.models.VacancyScreenshot ||
  mongoose.model("VacancyScreenshot", vacancyScreenshotSchema);

export default VacancyScreenshot;
