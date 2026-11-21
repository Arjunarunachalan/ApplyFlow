import { Router } from "express";
import { resumeUpload } from "../middleware/upload.js";
import {
  deleteResume,
  getResumes,
  reparseResume,
  setDefaultResume,
  uploadResume,
} from "../controllers/resumeController.js";

const router = Router();

router.post("/", resumeUpload.single("file"), uploadResume);
router.get("/", getResumes);
router.post("/:id/reparse", reparseResume);
router.patch("/:id/default", setDefaultResume);
router.delete("/:id", deleteResume);

export default router;
