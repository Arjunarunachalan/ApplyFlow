import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    techStack: { type: [String], default: [] },
    highlight: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const profileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    fullName: { type: String, trim: true, default: "" },
    headline: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    yearsOfExperience: { type: Number, min: 0, default: 0 },
    skills: { type: [String], default: [] },
    // Portfolio proof the generator can reference for a specific vacancy.
    projects: { type: [projectSchema], default: [] },
    summary: { type: String, trim: true, default: "" },
    portfolioUrl: { type: String, trim: true, default: "" },
    githubUrl: { type: String, trim: true, default: "" },
    linkedinUrl: { type: String, trim: true, default: "" },
    // Conservative application-level sending controls (auto-send explicitly off by default)
    dailyEmailLimit: { type: Number, min: 1, default: 20 },
    batchEmailLimit: { type: Number, min: 1, max: 50, default: 10 },
    sendDelaySeconds: { type: Number, min: 15, default: 60 },
    maxRetries: { type: Number, min: 0, max: 5, default: 2 },
    autoSendEnabled: { type: Boolean, default: false },
    geminiApiKey: { type: String, trim: true, default: "", select: false },
  },
  { timestamps: true },
);

// Sensible shape returned by GET /api/profile before the first save.
export const DEFAULT_PROFILE = {
  fullName: "",
  headline: "",
  email: "",
  phone: "",
  location: "",
  yearsOfExperience: 0,
  skills: [],
  projects: [],
  summary: "",
  portfolioUrl: "",
  githubUrl: "",
  linkedinUrl: "",
  dailyEmailLimit: Number(process.env.DAILY_EMAIL_LIMIT) || 20,
  batchEmailLimit: 10,
  sendDelaySeconds: 60,
  maxRetries: 2,
  autoSendEnabled: false,
};

export const defaultProfile = () => ({ ...DEFAULT_PROFILE, skills: [], projects: [] });

export const Profile =
  mongoose.models.Profile || mongoose.model("Profile", profileSchema);

export default Profile;
