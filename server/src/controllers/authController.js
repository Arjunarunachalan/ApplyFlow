import { getOrCreateDefaultOwner, isAuthRequired } from "../middleware/auth.js";
import User from "../models/User.js";
import {
  SESSION_COOKIE_NAME,
  extractTokenFromRequest,
  hashPassword,
  sessionCookieOptions,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from "../utils/auth.js";
import { claimLegacyRecordsForUser } from "../utils/migrateLegacy.js";

// If ADMIN_EMAIL + ADMIN_PASSWORD are provided via env and no user exists yet,
// seed the single owner user automatically so automated/container setups work seamlessly.
const ensureEnvBootstrapUser = async () => {
  const count = await User.countDocuments();
  if (count > 0) return null;

  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || "");
  if (!adminEmail || adminPassword.length < 8) return null;

  const user = await User.create({
    name: String(process.env.ADMIN_NAME || "Owner").trim() || "Owner",
    email: adminEmail,
    passwordHash: hashPassword(adminPassword),
  });
  await claimLegacyRecordsForUser(user._id);
  return user;
};

// GET /api/auth/status
export const getAuthStatus = async (req, res) => {
  try {
    if (!isAuthRequired()) {
      const owner = await getOrCreateDefaultOwner();
      return res.json({
        authenticated: true,
        authRequired: false,
        needsSetup: false,
        user: { id: owner._id, email: owner.email, name: owner.name },
      });
    }

    await ensureEnvBootstrapUser();
    const userCount = await User.countDocuments();
    const needsSetup = userCount === 0;

    if (needsSetup) {
      return res.json({
        authenticated: false,
        authRequired: true,
        needsSetup: true,
        user: null,
      });
    }

    const token = extractTokenFromRequest(req);
    const decoded = verifySessionToken(token);
    if (!decoded?.sub) {
      return res.json({
        authenticated: false,
        authRequired: true,
        needsSetup: false,
        user: null,
      });
    }

    const user = await User.findById(decoded.sub).select("_id email name").lean();
    if (!user) {
      return res.json({
        authenticated: false,
        authRequired: true,
        needsSetup: false,
        user: null,
      });
    }

    return res.json({
      authenticated: true,
      authRequired: true,
      needsSetup: false,
      user: { id: user._id, email: user.email, name: user.name },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/auth/setup — one-time single-user owner account creation
export const setupOwner = async (req, res) => {
  try {
    const existingCount = await User.countDocuments();
    if (existingCount > 0) {
      return res.status(403).json({
        error: "Owner account is already configured. Single-user limit reached.",
      });
    }

    const { name, email, password } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanName = String(name || "Owner").trim() || "Owner";

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 16) {
      return res.status(500).json({
        error: "Server AUTH_SECRET is not configured. Add AUTH_SECRET (min 16 chars) to environment variables.",
      });
    }

    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      passwordHash: hashPassword(password),
      lastLoginAt: new Date(),
    });

    await claimLegacyRecordsForUser(user._id);

    const token = signSessionToken(user);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(req));

    return res.status(201).json({
      user: { id: user._id, email: user.email, name: user.name },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    await ensureEnvBootstrapUser();

    const { email, password } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ email: cleanEmail });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    user.lastLoginAt = new Date();
    await user.save();

    await claimLegacyRecordsForUser(user._id);

    const token = signSessionToken(user);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(req));

    return res.json({
      user: { id: user._id, email: user.email, name: user.name },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/auth/logout
export const logout = (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, {
    ...sessionCookieOptions(req),
    maxAge: 0,
  });
  return res.json({ message: "Signed out" });
};

// GET /api/auth/me
export const getMe = async (req, res) => {
  return res.json({
    user: { id: req.user._id, email: req.user.email, name: req.user.name },
  });
};
