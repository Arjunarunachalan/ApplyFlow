import mongoose from "mongoose";

export const APPLICATION_STATUSES = [
  "draft",
  "approved",
  "queued",
  "sent",
  "replied",
  "interview",
  "rejected",
  "failed",
];

// Statuses a sent application can move to when the reply comes in.
export const OUTCOME_STATUSES = ["replied", "interview", "rejected"];

export const DELIVERY_STATUSES = [
  "NOT_SENT",
  "QUEUED",
  "SENDING",
  "ACCEPTED_BY_GMAIL",
  "FAILED",
  "NEEDS_REVIEW",
];

const applicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resume",
      required: true,
    },
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    htmlBody: { type: String, default: "" },
    recipientEmail: { type: String, lowercase: true, trim: true },
    status: { type: String, enum: APPLICATION_STATUSES, default: "draft" },
    deliveryStatus: {
      type: String,
      enum: DELIVERY_STATUSES,
      default: "NOT_SENT",
    },
    approvedAt: { type: Date },
    providerUsed: { type: String, trim: true, default: "template" },
    // A follow-up is a second email about a job that was already applied to,
    // so it must not be treated as a duplicate application.
    isFollowUp: { type: Boolean, default: false },
    followUpFor: { type: mongoose.Schema.Types.ObjectId, ref: "Application" },
    messageId: { type: String, trim: true },
    errorLog: { type: String, trim: true },
    sentAt: { type: Date },
    followUpDate: { type: Date },
    // Filled by services/replySync.js when an HR reply arrives.
    repliedAt: { type: Date },
    replySnippet: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

applicationSchema.index({ jobId: 1 });
applicationSchema.index({ status: 1, createdAt: -1 });

export const Application =
  mongoose.models.Application ||
  mongoose.model("Application", applicationSchema);

export default Application;
