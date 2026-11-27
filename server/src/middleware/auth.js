import User from "../models/User.js";
import { extractTokenFromRequest, verifySessionToken } from "../utils/auth.js";

export const requireAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromRequest(req);
    const decoded = verifySessionToken(token);
    if (!decoded?.sub) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await User.findById(decoded.sub).select("_id email name").lean();
    if (!user) {
      return res.status(401).json({ error: "Session user not found" });
    }

    req.user = user;
    return next();
  } catch (err) {
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
    }
  } catch {
    // Ignore invalid optional token
  }
  return next();
};
