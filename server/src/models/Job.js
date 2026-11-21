import mongoose from "mongoose";

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isValidEmail = (value) =>
  typeof value === "string" && EMAIL_REGEX.test(value.trim());

export const APPLICATION_TYPES = ["email", "portal", "unknown"];

export const JOB_STATUSES = [
  "new",
  "draft_ready",
  "approved",
  "queued",
  "sent",
  "replied",
  "interview",
  "rejected",
  "failed",
];

// A job is an "email" application only when we hold a usable HR address,
// otherwise a portal link is the way in, and without either it is unknown.
export const computeApplicationType = (hrEmail, applyUrl) => {
  if (isValidEmail(hrEmail)) return "email";
  if (typeof applyUrl === "string" && applyUrl.trim()) return "portal";
  return "unknown";
};

// Interview details live on the job so upcoming interviews can be listed
// without joining applications.
const interviewSchema = new mongoose.Schema(
  {
    date: { type: Date },
    meetingUrl: { type: String, trim: true, default: "" },
    round: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const jobSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true },
    jobRole: { type: String, required: true, trim: true },
    hrEmail: { type: String, lowercase: true, trim: true, default: "" },
    applyUrl: { type: String, trim: true, default: "" },
    jobDescription: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    companyWebsite: { type: String, trim: true, default: "" },
    salary: { type: String, trim: true, default: "" },
    emailSource: { type: String, trim: true, default: "" },
    applicationType: {
      type: String,
      enum: APPLICATION_TYPES,
      default: "unknown",
    },
    status: { type: String, enum: JOB_STATUSES, default: "new" },
    // Filled by services/jobMatcher.js on import and on recalculation.
    matchScore: { type: Number, min: 0, max: 100, default: 0 },
    matchedSkills: { type: [String], default: [] },
    interview: { type: interviewSchema, default: () => ({}) },
  },
  { timestamps: true },
);

// Deduplication key for imports plus the dashboard's newest-first listing.
jobSchema.index({ companyName: 1, jobRole: 1, hrEmail: 1 });
jobSchema.index({ createdAt: -1 });

jobSchema.pre("validate", function computeType() {
  this.applicationType = computeApplicationType(this.hrEmail, this.applyUrl);
});

export const Job = mongoose.models.Job || mongoose.model("Job", jobSchema);

export default Job;
