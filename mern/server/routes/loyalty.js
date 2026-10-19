import { Router } from "express";
import { protect, allow } from "../middleware/auth.js";
import { getLoyaltySummary } from "../lib/loyalty.js";
const router = Router();

// The signed-in customer's balance, lifetime totals and points history (newest first).
router.get("/me", protect, allow("customer"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    res.json(await getLoyaltySummary(req.user, { page, limit }));
  } catch (e) { next(e); }
});

export default router;
