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

// A single candidate profile for now, which is why there is no owner field.
// Timestamps keep the shape ready for a future multi-user version.
const profileSchema = new mongoose.Schema(
  {
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
    dailyEmailLimit: { type: Number, min: 1, default: 30 },
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
  dailyEmailLimit: Number(process.env.DAILY_EMAIL_LIMIT) || 30,
};

export const defaultProfile = () => ({ ...DEFAULT_PROFILE, skills: [], projects: [] });

export const Profile =
  mongoose.models.Profile || mongoose.model("Profile", profileSchema);

export default Profile;
