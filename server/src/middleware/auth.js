import User from "../models/User.js";
import { extractTokenFromRequest, hashPassword, verifySessionToken } from "../utils/auth.js";
import { claimLegacyRecordsForUser } from "../utils/migrateLegacy.js";

let legacyClaimed = false;

export const isAuthRequired = () =>
  String(process.env.AUTH_REQUIRED || "false").toLowerCase() === "true";

export const getOrCreateDefaultOwner = async () => {
  let user = await User.findOne().sort({ createdAt: 1 }).select("_id email name").lean();
  if (!user) {
    const email =
      String(process.env.ADMIN_EMAIL || process.env.GMAIL_USER || "owner@applyflow.local")
        .trim()
        .toLowerCase();
    const name = String(process.env.ADMIN_NAME || "Arjun").trim() || "Arjun";
    const created = await User.create({
      name,
      email,
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD || "applyflow-local-owner"),
    });
    user = { _id: created._id, email: created.email, name: created.name };
  }

  if (!legacyClaimed) {
    await claimLegacyRecordsForUser(user._id);
    legacyClaimed = true;
  }

  return user;
};

export const requireAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromRequest(req);
    const decoded = verifySessionToken(token);
    if (decoded?.sub) {
      const user = await User.findById(decoded.sub).select("_id email name").lean();
      if (user) {
        if (!legacyClaimed) {
          await claimLegacyRecordsForUser(user._id);
          legacyClaimed = true;
        }
        req.user = user;
        return next();
      }
    }

    // Personal single-user mode: skip login gate unless AUTH_REQUIRED=true
    if (!isAuthRequired()) {
      req.user = await getOrCreateDefaultOwner();
      return next();
    }

    return res.status(401).json({ error: "Authentication required" });
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
};

export const optionalAuth = async (req, _res, next) => {
  try {
    const token = extractTokenFromRequest(req);
    const decoded = verifySessionToken(token);
    if (decoded?.sub) {
      const user = await User.findById(decoded.sub).select("_id email name").lean();
      if (user) req.user = user;
    } else if (!isAuthRequired()) {
      req.user = await getOrCreateDefaultOwner();
    }
  } catch {
    // Ignore invalid optional token
  }
  return next();
};
