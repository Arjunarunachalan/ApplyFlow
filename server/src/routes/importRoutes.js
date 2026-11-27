import { Router } from "express";
import multer from "multer";
import { listImportBatches } from "../controllers/importsController.js";
import {
  cancelScreenshotSession,
  confirmScreenshotVacancy,
  deleteScreenshot,
  extractFromSession,
  getScreenshotImage,
  reorderScreenshots,
  uploadScreenshots,
} from "../controllers/screenshotImportController.js";

const router = Router();

const screenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 10,
  },
});

router.get("/", listImportBatches);

router.post("/screenshots/upload", screenshotUpload.array("screenshots", 10), uploadScreenshots);
router.patch("/screenshots/reorder", reorderScreenshots);
router.post("/screenshots/extract", extractFromSession);
router.post("/screenshots/confirm", confirmScreenshotVacancy);
router.get("/screenshots/:id/image", getScreenshotImage);
router.delete("/screenshots/session/:sessionId", cancelScreenshotSession);
router.delete("/screenshots/:id", deleteScreenshot);

export default router;
