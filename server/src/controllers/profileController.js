import Profile, { DEFAULT_PROFILE } from "../models/Profile.js";

const STRING_FIELDS = [
  "fullName",
  "headline",
  "email",
  "phone",
  "location",
  "summary",
  "portfolioUrl",
  "githubUrl",
  "linkedinUrl",
];

const asString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const asNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// The form sends "React, Node.js", the API also accepts a real array.
const asSkills = (value) => {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
  }
  return [];
};

// Each showcase project is one AI-usable proof point, so a nameless card is dropped.
const asProjects = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((project) => ({
      name: asString(project?.name),
      techStack: asSkills(project?.techStack),
      highlight: asString(project?.highlight),
      url: asString(project?.url),
    }))
    .filter((project) => project.name);
};

const pickProfileFields = (body = {}) => {
  const fields = {};

  for (const key of STRING_FIELDS) {
    if (body[key] !== undefined) fields[key] = asString(body[key]);
  }

  if (body.yearsOfExperience !== undefined) {
    fields.yearsOfExperience = Math.max(0, asNumber(body.yearsOfExperience, 0));
  }

  if (body.skills !== undefined) fields.skills = asSkills(body.skills);

  if (body.projects !== undefined) fields.projects = asProjects(body.projects);

  if (body.dailyEmailLimit !== undefined) {
    const limit = Math.floor(asNumber(body.dailyEmailLimit, DEFAULT_PROFILE.dailyEmailLimit));
    fields.dailyEmailLimit = limit > 0 ? limit : DEFAULT_PROFILE.dailyEmailLimit;
  }

  return fields;
};

// GET /api/profile
export const getProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id }).lean();
    return res.json(profile || { ...DEFAULT_PROFILE, skills: [], projects: [] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// PUT /api/profile
export const upsertProfile = async (req, res) => {
  try {
    const updates = pickProfileFields(req.body);

    let profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) profile = new Profile({ userId: req.user._id });
    Object.assign(profile, updates);
    await profile.save();

    return res.json(profile);
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
};
