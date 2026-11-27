import Profile, { DEFAULT_PROFILE } from "../models/Profile.js";

const maskEmail = (email = "") => {
  const clean = String(email || "").trim();
  if (!clean.includes("@")) return "";
  const [local, domain] = clean.split("@");
  if (local.length <= 2) return `${local[0] || "*"}*@${domain}`;
  return `${local.slice(0, 2)}${"*".repeat(Math.min(5, local.length - 2))}@${domain}`;
};

// GET /api/settings — non-secret configuration view for Email & AI Settings pages
export const getSettings = async (req, res) => {
  try {
    const profile = (await Profile.findOne({ userId: req.user._id }).lean()) || DEFAULT_PROFILE;

    return res.json({
      email: {
        oauthSupported: false, // Implemented in Phase 5
        oauthConnected: false,
        connectedEmail: "",
        legacySmtpConfigured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
        legacySmtpAccount: maskEmail(process.env.GMAIL_USER),
        dailyEmailLimit: profile.dailyEmailLimit ?? DEFAULT_PROFILE.dailyEmailLimit,
        batchEmailLimit: profile.batchEmailLimit ?? DEFAULT_PROFILE.batchEmailLimit,
        sendDelaySeconds: profile.sendDelaySeconds ?? DEFAULT_PROFILE.sendDelaySeconds,
        maxRetries: profile.maxRetries ?? DEFAULT_PROFILE.maxRetries,
        autoSendEnabled: Boolean(profile.autoSendEnabled),
      },
      ai: {
        provider: String(process.env.AI_PROVIDER || "template").toLowerCase(),
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
        geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        ollamaUrl: process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate",
        ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5-coder:1.5b",
        timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 20000,
        visionSupported: Boolean(process.env.GEMINI_API_KEY),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// PUT /api/settings/email — update conservative sending controls
export const updateEmailSettings = async (req, res) => {
  try {
    const body = req.body || {};
    let profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) {
      profile = new Profile({ userId: req.user._id });
    }

    if (body.dailyEmailLimit !== undefined) {
      const val = Math.floor(Number(body.dailyEmailLimit));
      if (!Number.isFinite(val) || val < 1 || val > 200) {
        return res.status(400).json({ error: "dailyEmailLimit must be between 1 and 200." });
      }
      profile.dailyEmailLimit = val;
    }

    if (body.batchEmailLimit !== undefined) {
      const val = Math.floor(Number(body.batchEmailLimit));
      if (!Number.isFinite(val) || val < 1 || val > 50) {
        return res.status(400).json({ error: "batchEmailLimit must be between 1 and 50." });
      }
      profile.batchEmailLimit = val;
    }

    if (body.sendDelaySeconds !== undefined) {
      const val = Math.floor(Number(body.sendDelaySeconds));
      if (!Number.isFinite(val) || val < 15 || val > 600) {
        return res.status(400).json({ error: "sendDelaySeconds must be between 15 and 600." });
      }
      profile.sendDelaySeconds = val;
    }

    if (body.maxRetries !== undefined) {
      const val = Math.floor(Number(body.maxRetries));
      if (!Number.isFinite(val) || val < 0 || val > 5) {
        return res.status(400).json({ error: "maxRetries must be between 0 and 5." });
      }
      profile.maxRetries = val;
    }

    if (body.autoSendEnabled !== undefined) {
      profile.autoSendEnabled = Boolean(body.autoSendEnabled);
    }

    await profile.save();

    return res.json({
      dailyEmailLimit: profile.dailyEmailLimit,
      batchEmailLimit: profile.batchEmailLimit,
      sendDelaySeconds: profile.sendDelaySeconds,
      maxRetries: profile.maxRetries,
      autoSendEnabled: profile.autoSendEnabled,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
