import { Router } from "express";
import { getSettings, updateEmailSettings } from "../controllers/settingsController.js";

const router = Router();

router.get("/", getSettings);
router.put("/email", updateEmailSettings);

export default router;
