import { Router } from "express";
import {
  getAuthStatus,
  getMe,
  login,
  logout,
  setupOwner,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/status", getAuthStatus);
router.post("/setup", setupOwner);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, getMe);

export default router;
