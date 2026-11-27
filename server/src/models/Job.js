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
  "archived",
];

export const LIFECYCLE_STATUSES = [
  "IMPORTED",
  "EXTRACTION_REVIEW",
  "EXTRACTION_FAILED",
  "CONTACT_DISCOVERY",
  "CONTACT_AVAILABLE",
  "CONTACT_NOT_FOUND",
  "CONTACT_REQUIRES_REVIEW",
  "EMAIL_DRAFT_PENDING",
  "EMAIL_DRAFT_READY",
  "EMAIL_GENERATION_FAILED",
  "AWAITING_APPROVAL",
  "APPROVED",
  "QUEUED",
  "SENDING",
  "SENT",
  "SEND_FAILED",
  "NEEDS_REVIEW",
  "PORTAL_APPLICATION_REQUIRED",
  "ARCHIVED",
];

export const CONTACT_STATUSES = [
  "VERIFIED_PUBLIC_SOURCE",
  "PUBLICLY_LISTED_UNVERIFIED",
  "NOT_FOUND",
  "INVALID_FORMAT",
  "MANUAL_REVIEW_REQUIRED",
];

export const OUTCOME_STATUSES = ["none", "replied", "interview", "rejected"];
export const WORK_ARRANGEMENTS = ["office", "remote", "hybrid", "unspecified"];
export const JOB_IMPORT_TYPES = ["screenshot", "csv", "xlsx", "manual"];

// A job is an "email" application only when we hold a usable HR address,
// otherwise a portal link is the way in, and without either it is unknown.
export const computeApplicationType = (hrEmail, applyUrl) => {
  if (isValidEmail(hrEmail)) return "email";
  if (typeof applyUrl === "string" && applyUrl.trim()) return "portal";
  return "unknown";
};

export const deriveLifecycleFromJob = ({
  status,
  lifecycleStatus,
  hrEmail,
  applyUrl,
  applicationType,
} = {}) => {
  if (lifecycleStatus && LIFECYCLE_STATUSES.includes(lifecycleStatus) && lifecycleStatus !== "IMPORTED") {
    return lifecycleStatus;
  }

  const resolvedType = applicationType || computeApplicationType(hrEmail, applyUrl);

  switch (status) {
    case "archived":
      return "ARCHIVED";
    case "sent":
    case "replied":
    case "interview":
    case "rejected":
      return "SENT";
    case "failed":
      return "SEND_FAILED";
    case "queued":
      return "QUEUED";
    case "approved":
      return "APPROVED";
    case "draft_ready":
      return "EMAIL_DRAFT_READY";
    case "new":
    default:
      if (isValidEmail(hrEmail) || resolvedType === "email") return "CONTACT_AVAILABLE";
      if (resolvedType === "portal") return "PORTAL_APPLICATION_REQUIRED";
      return "CONTACT_NOT_FOUND";
  }
};

export const legacyStatusFromLifecycle = (lifecycleStatus, outcomeStatus = "none") => {
  if (lifecycleStatus === "ARCHIVED") return "archived";
  if (lifecycleStatus === "SENT" && outcomeStatus && outcomeStatus !== "none") {
    return outcomeStatus;
  }
  switch (lifecycleStatus) {
    case "SENT":
      return "sent";
    case "QUEUED":
    case "SENDING":
      return "queued";
    case "APPROVED":
      return "approved";
    case "EMAIL_DRAFT_READY":
    case "AWAITING_APPROVAL":
      return "draft_ready";
    case "EXTRACTION_FAILED":
    case "EMAIL_GENERATION_FAILED":
    case "SEND_FAILED":
      return "failed";
    default:
      return "new";
  }
};

export const deriveContactStatus = ({ hrEmail, contactStatus } = {}) => {
  const email = typeof hrEmail === "string" ? hrEmail.trim() : "";
  if (email && !isValidEmail(email)) return "INVALID_FORMAT";
  if (contactStatus && CONTACT_STATUSES.includes(contactStatus)) {
    if (!email && contactStatus === "VERIFIED_PUBLIC_SOURCE") return "NOT_FOUND";
    return contactStatus;
  }
  return isValidEmail(email) ? "PUBLICLY_LISTED_UNVERIFIED" : "NOT_FOUND";
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
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    importBatchId: { type: mongoose.Schema.Types.ObjectId, ref: "ImportBatch", index: true },
    companyName: { type: String, required: true, trim: true },
    jobRole: { type: String, required: true, trim: true },
    hrName: { type: String, trim: true, default: "" },
    hrEmail: { type: String, lowercase: true, trim: true, default: "" },
    applyUrl: { type: String, trim: true, default: "" },
    jobPostUrl: { type: String, trim: true, default: "" },
    jobDescription: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    companyWebsite: { type: String, trim: true, default: "" },
    salary: { type: String, trim: true, default: "" },
    emailSource: { type: String, trim: true, default: "" },
    importType: { type: String, enum: JOB_IMPORT_TYPES, default: "manual" },
    sourcePlatform: { type: String, trim: true, default: "" },
    experienceRequirement: { type: String, trim: true, default: "" },
    employmentType: { type: String, trim: true, default: "" },
    workArrangement: {
      type: String,
      enum: WORK_ARRANGEMENTS,
      default: "unspecified",
    },
    requiredSkills: { type: [String], default: [] },
    jobPostedAt: { type: Date },
    applicationType: {
      type: String,
      enum: APPLICATION_TYPES,
      default: "unknown",
    },
    status: { type: String, enum: JOB_STATUSES, default: "new" },
    lifecycleStatus: {
      type: String,
      enum: LIFECYCLE_STATUSES,
      default: "IMPORTED",
    },
    outcomeStatus: {
      type: String,
      enum: OUTCOME_STATUSES,
      default: "none",
    },
    contactStatus: {
      type: String,
      enum: CONTACT_STATUSES,
      default: "NOT_FOUND",
    },
    contactSourceUrl: { type: String, trim: true, default: "" },
    contactDiscoveredAt: { type: Date },
    // Filled by services/jobMatcher.js on import and on recalculation.
    matchScore: { type: Number, min: 0, max: 100, default: 0 },
    matchedSkills: { type: [String], default: [] },
    priorityScore: { type: Number, default: 0 },
    resumeIdUsed: { type: mongoose.Schema.Types.ObjectId, ref: "Resume" },
    archivedAt: { type: Date },
    interview: { type: interviewSchema, default: () => ({}) },
  },
  { timestamps: true },
);

// Deduplication key for imports plus the dashboard's newest-first listing.
jobSchema.index({ userId: 1, companyName: 1, jobRole: 1, hrEmail: 1 });
jobSchema.index({ userId: 1, lifecycleStatus: 1, createdAt: -1 });
jobSchema.index({ createdAt: -1 });

jobSchema.pre("validate", function syncJobState() {
  this.applicationType = computeApplicationType(this.hrEmail, this.applyUrl);
  this.contactStatus = deriveContactStatus({
    hrEmail: this.hrEmail,
    contactStatus: this.contactStatus,
  });

  if (["replied", "interview", "rejected"].includes(this.status) && this.outcomeStatus === "none") {
    this.outcomeStatus = this.status;
  }

  if (this.isModified("lifecycleStatus") && !this.isModified("status")) {
    this.status = legacyStatusFromLifecycle(this.lifecycleStatus, this.outcomeStatus);
  } else if (this.isModified("status") || !this.lifecycleStatus || this.lifecycleStatus === "IMPORTED") {
    this.lifecycleStatus = deriveLifecycleFromJob({
      status: this.status,
      lifecycleStatus: this.isModified("status") ? null : this.lifecycleStatus,
      hrEmail: this.hrEmail,
      applyUrl: this.applyUrl,
      applicationType: this.applicationType,
    });
  }

  const emailBonus = isValidEmail(this.hrEmail) ? 20 : 0;
  this.priorityScore = Math.min(120, Math.round((Number(this.matchScore) || 0) + emailBonus));
});

export const Job = mongoose.models.Job || mongoose.model("Job", jobSchema);

export default Job;
