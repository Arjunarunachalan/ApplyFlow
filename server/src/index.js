import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { emailQueue } from "./workers/emailQueue.js";
import jobRoutes from "./routes/jobRoutes.js";
import resumeRoutes from "./routes/resumeRoutes.js";
import profileRoutes from "./routes/profile.js";
import applicationRoutes from "./routes/applications.js";
import analyticsRoutes from "./routes/analytics.js";
import syncRoutes from "./routes/sync.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/jobs", jobRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/sync", syncRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Quick test route to queue an email
app.post("/api/test-email", async (req, res) => {
  try {
    const { to, subject, body } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: "to, subject, and body are required" });
    }

    const job = await emailQueue.add("send-application", {
      to,
      subject,
      body,
    });

    res.status(202).json({
      message: "Email queued successfully",
      jobId: job.id,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Surfaces upload/validation failures as JSON instead of an HTML stack.
app.use((err, _req, res, _next) => {
  const status = err.name === "MulterError" ? 400 : err.status || 500;
  res.status(status).json({ error: err.message });
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});