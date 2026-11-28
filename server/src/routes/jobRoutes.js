import { Router } from "express";
import { csvUpload } from "../middleware/upload.js";
import {
  archiveJob,
  bulkDeleteJobs,
  createJob,
  deleteJob,
  getJobSummary,
  getJobs,
  importJobsFromCsv,
  recalculateScores,
  upcomingInterviews,
  updateInterview,
  updateJob,
  updateJobStatus,
} from "../controllers/jobController.js";

const router = Router();

router.post("/import-csv", csvUpload.single("file"), importJobsFromCsv);
router.post("/bulk-delete", bulkDeleteJobs);
router.post("/recalculate-scores", recalculateScores);
router.get("/summary", getJobSummary);
router.get("/upcoming-interviews", upcomingInterviews);
router.post("/manual", createJob);
router.post("/", createJob);
router.get("/", getJobs);
router.patch("/:id/archive", archiveJob);
router.patch("/:id/interview", updateInterview);
router.patch("/:id/status", updateJobStatus);
router.patch("/:id", updateJob);
router.delete("/:id", deleteJob);

export default router;
