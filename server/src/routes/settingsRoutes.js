import { Router } from "express";
import { getSettings, updateAiSettings, updateEmailSettings } from "../controllers/settingsController.js";

const router = Router();

router.get("/", getSettings);
router.put("/email", updateEmailSettings);
router.put("/ai", updateAiSettings);

export default router;
