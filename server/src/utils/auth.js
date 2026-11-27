import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "applyflow_session";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

const getAuthSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET environment variable must be set (minimum 16 characters).",
    );
  }
  return secret;
};

export const hashPassword = (password) => {
  const plain = String(password || "");
  if (plain.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${derived}`;
};

export const verifyPassword = (password, storedHash) => {
  if (!password || !storedHash || !String(storedHash).includes(":")) return false;
  const [salt, keyHex] = String(storedHash).split(":");
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, "hex");
    const derived = crypto.scryptSync(String(password), salt, 64);
    if (keyBuf.length !== derived.length) return false;
    return crypto.timingSafeEqual(keyBuf, derived);
  } catch {
    return false;
  }
};

const base64UrlEncode = (input) =>
  Buffer.from(input).toString("base64url");

const base64UrlDecode = (input) =>
  Buffer.from(input, "base64url").toString("utf8");

export const signSessionToken = (user) => {
  const secret = getAuthSecret();
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: String(user._id),
      email: user.email,
      name: user.name,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    }),
  );
  const data = `${header}.${payload}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
};

export const verifySessionToken = (token) => {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let secret;
  try {
    secret = getAuthSecret();
  } catch {
    return null;
  }

  const [header, payload, signature] = parts;
  const data = `${header}.${payload}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");

  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(base64UrlDecode(payload));
    const now = Math.floor(Date.now() / 1000);
    if (!decoded.sub || (decoded.exp && decoded.exp < now)) return null;
    return decoded;
  } catch {
    return null;
  }
};

export const parseCookies = (cookieHeader = "") => {
  const cookies = {};
  for (const part of String(cookieHeader).split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
};

export const extractTokenFromRequest = (req) => {
  const authHeader = req.headers?.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers?.cookie || "");
  return cookies[SESSION_COOKIE_NAME] || null;
};

export const sessionCookieOptions = (req) => {
  const isSecure =
    Boolean(process.env.VERCEL) ||
    req.secure ||
    req.headers?.["x-forwarded-proto"] === "https";
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: TOKEN_TTL_SECONDS * 1000,
  };
};
