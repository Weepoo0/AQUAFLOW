import User from "../models/User.js";
import Payment from "../models/Payment.js";
import { awardLoyaltyPoints } from "./loyalty.js";

// A delivered order that has been paid for is finished: complete it automatically.
// Completing an order confirms its payment, and only then are loyalty points awarded (once per order).
export async function finalizeIfDone(order) {
  if (order.status === "Delivered" && order.paymentStatus === "Paid") order.status = "Completed";
  if (order.status === "Completed") {
    await Payment.findOneAndUpdate({ order: order._id, status: "Pending" }, { status: "Paid", paidAt: new Date() });
    order.paymentStatus = "Paid";
    await awardLoyaltyPoints(order);
  }
  return order;
}

// Free a rider when no active deliveries remain.
export async function releaseRiderIfIdle(riderId, Order, excludeId) {
  if (!riderId) return;
  const remaining = await Order.countDocuments({ rider: riderId, _id: { $ne: excludeId }, status: { $nin: ["Delivered", "Completed", "Cancelled"] } });
  if (remaining === 0) await User.updateOne({ _id: riderId, role: "rider", riderStatus: "Busy" }, { riderStatus: "Ready" });
}
