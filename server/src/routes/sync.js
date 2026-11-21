import { Router } from "express";
import { syncReplies } from "../services/replySync.js";

const router = Router();

// POST /api/sync/replies — manual trigger for the IMAP reply/bounce scan.
// IMAP failures come back as a normal 200 with an `error` message so a
// disabled mailbox never crashes the dashboard.
router.post("/replies", async (_req, res) => {
  try {
    const result = await syncReplies();
    return res.json(result);
  } catch (error) {
    return res.json({
      checked: 0,
      repliesFound: 0,
      bouncesFound: 0,
      error: error.message,
    });
  }
});

export default router;
