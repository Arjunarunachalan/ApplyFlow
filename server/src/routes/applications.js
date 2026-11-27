import { Router } from "express";
import {
  approveAndQueue,
  approveBatch,
  approveOnly,
  approveOnlyBatch,
  autoApply,
  autoApplyBatch,
  exportApplicationsCsv,
  exportApplicationsPdf,
  generateBatch,
  generateDraft,
  generateFollowUp,
  listApplications,
  processQueue,
  sendNow,
  updateApplication,
  updateApplicationStatus,
} from "../controllers/applicationController.js";

const router = Router();

router.get("/", listApplications);
router.get("/export-csv", exportApplicationsCsv);
router.get("/export-pdf", exportApplicationsPdf);
router.post("/process-queue", processQueue);
router.post("/auto-apply-batch", autoApplyBatch);
router.post("/auto-apply/:jobId", autoApply);
router.post("/generate-batch", generateBatch);
router.post("/approve-only-batch", approveOnlyBatch);
router.post("/approve-batch", approveBatch);
router.post("/generate/:jobId", generateDraft);
router.post("/:id/approve", approveOnly);
router.post("/:id/send-now", sendNow);
router.post("/:id/generate-followup", generateFollowUp);
router.patch("/:id/status", updateApplicationStatus);
router.patch("/:id", updateApplication);
router.post("/:id/approve-and-queue", approveAndQueue);

export default router;
