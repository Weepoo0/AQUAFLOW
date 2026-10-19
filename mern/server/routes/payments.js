import { Router } from "express";
import Payment from "../models/Payment.js";
import Order from "../models/Order.js";
import { protect, allow } from "../middleware/auth.js";
import { publish } from "../realtime.js";
const router = Router();
router.get("/", protect, async (req, res, next) => {
  try {
    const filter = req.user.role === "admin" ? {} : { customer: req.user._id };
    res.json(await Payment.find(filter).populate("order", "orderNumber status").populate("customer", "name").sort({ createdAt: -1 }));
  } catch (e) { next(e); }
});
router.patch("/:id/status", protect, allow("admin"), async (req, res, next) => {
  try {
    if (!["Paid", "Pending"].includes(req.body.status)) return res.status(400).json({ message: "Invalid payment status." });
    const payment = await Payment.findByIdAndUpdate(req.params.id, { status: req.body.status, paidAt: req.body.status === "Paid" ? new Date() : null }, { new: true });
    if (!payment) return res.status(404).json({ message: "Payment not found." });
    await Order.findByIdAndUpdate(payment.order, { paymentStatus: payment.status });
    const order = await Order.findById(payment.order).select("customer rider orderNumber");
    const targets = { roles: ["admin"], userIds: [String(payment.customer), ...(order?.rider ? [String(order.rider)] : [])] };
    publish("payment.updated", { paymentId: String(payment._id), orderNumber: order?.orderNumber, status: payment.status }, targets);
    res.json(payment);
  } catch (e) { next(e); }
});
export default router;
