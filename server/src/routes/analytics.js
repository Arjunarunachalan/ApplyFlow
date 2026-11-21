import { Router } from "express";
import { getAnalytics, sendDigest } from "../controllers/analyticsController.js";

const router = Router();

router.get("/", getAnalytics);
router.post("/send-digest", sendDigest);

export default router;
