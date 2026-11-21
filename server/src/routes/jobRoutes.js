import { Router } from "express";
import { csvUpload } from "../middleware/upload.js";
import {
  createJob,
  deleteJob,
  getJobs,
  importJobsFromCsv,
  recalculateScores,
  updateInterview,
  updateJobStatus,
  upcomingInterviews,
} from "../controllers/jobController.js";

const router = Router();

router.post("/import-csv", csvUpload.single("file"), importJobsFromCsv);
router.post("/recalculate-scores", recalculateScores);
router.get("/upcoming-interviews", upcomingInterviews);
router.post("/manual", createJob);
router.post("/", createJob);
router.get("/", getJobs);
router.patch("/:id/interview", updateInterview);
router.patch("/:id/status", updateJobStatus);
router.delete("/:id", deleteJob);

export default router;
