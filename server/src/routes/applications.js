import { Router } from "express";
import {
  approveAndQueue,
  approveBatch,
  exportApplicationsCsv,
  exportApplicationsPdf,
  generateBatch,
  generateDraft,
  generateFollowUp,
  listApplications,
  updateApplication,
  updateApplicationStatus,
} from "../controllers/applicationController.js";

const router = Router();

router.get("/", listApplications);
router.get("/export-csv", exportApplicationsCsv);
router.get("/export-pdf", exportApplicationsPdf);
router.post("/generate-batch", generateBatch);
router.post("/approve-batch", approveBatch);
router.post("/generate/:jobId", generateDraft);
router.post("/:id/generate-followup", generateFollowUp);
router.patch("/:id/status", updateApplicationStatus);
router.patch("/:id", updateApplication);
router.post("/:id/approve-and-queue", approveAndQueue);

export default router;
