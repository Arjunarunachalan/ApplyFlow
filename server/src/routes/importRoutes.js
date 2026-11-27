import { Router } from "express";
import { listImportBatches } from "../controllers/importsController.js";

const router = Router();

router.get("/", listImportBatches);

export default router;
