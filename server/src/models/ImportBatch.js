import mongoose from "mongoose";

export const IMPORT_TYPES = ["screenshot", "csv", "xlsx", "manual"];

const importErrorSchema = new mongoose.Schema(
  {
    rowIndex: { type: Number },
    companyName: { type: String, trim: true, default: "" },
    message: { type: String, required: true },
  },
  { _id: false },
);

const importBatchSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    importType: { type: String, enum: IMPORT_TYPES, required: true },
    fileName: { type: String, trim: true, default: "" },
    sourceLabel: { type: String, trim: true, default: "" },
    totalRecords: { type: Number, default: 0 },
    importedCount: { type: Number, default: 0 },
    skippedDuplicates: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    errors: { type: [importErrorSchema], default: [] },
  },
  { timestamps: true },
);

importBatchSchema.index({ userId: 1, createdAt: -1 });

export const ImportBatch =
  mongoose.models.ImportBatch || mongoose.model("ImportBatch", importBatchSchema);

export default ImportBatch;
