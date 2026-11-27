import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import express from "express";
import { connectDB } from "./config/db.js";
import { requireAuth } from "./middleware/auth.js";
import analyticsRoutes from "./routes/analytics.js";
import applicationRoutes from "./routes/applications.js";
import authRoutes from "./routes/authRoutes.js";
import importRoutes from "./routes/importRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import profileRoutes from "./routes/profile.js";
import resumeRoutes from "./routes/resumeRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import syncRoutes from "./routes/sync.js";

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

// Ensure MongoDB is connected before handling requests in serverless environments
app.use(async (_req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("Database connection middleware error:", err.message);
    return res.status(500).json({
      error: `Database connection failed: ${err.message}. Please verify MONGO_URI in Vercel settings and ensure MongoDB Atlas allows access from all IPs (0.0.0.0/0).`,
    });
  }
});

// Public health and single-user authentication endpoints
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.use("/api/auth", authRoutes);

// Protected single-user API routes
app.use("/api/jobs", requireAuth, jobRoutes);
app.use("/api/vacancies", requireAuth, jobRoutes);
app.use("/api/resumes", requireAuth, resumeRoutes);
app.use("/api/profile", requireAuth, profileRoutes);
app.use("/api/applications", requireAuth, applicationRoutes);
app.use("/api/analytics", requireAuth, analyticsRoutes);
app.use("/api/sync", requireAuth, syncRoutes);
app.use("/api/imports", requireAuth, importRoutes);
app.use("/api/settings", requireAuth, settingsRoutes);

// Surfaces upload/validation failures as JSON instead of an HTML stack.
app.use((err, _req, res, _next) => {
  const status = err.name === "MulterError" ? 400 : err.status || 500;
  res.status(status).json({ error: err.message });
});

if (!process.env.VERCEL) {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
}

export default app;
