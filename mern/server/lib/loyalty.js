import User from "../models/User.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import AuditLog from "../models/AuditLog.js";
import { publish } from "../realtime.js";

// Approved earning rule: 1 point for every full ₱100 of the order total.
export const PESOS_PER_POINT = 100;
export const pointsForTotal = (total) => Math.floor(Number(total || 0) / PESOS_PER_POINT);

/** Is this order allowed to earn points? (Does not check whether points were already given.) */
export function checkLoyaltyEligibility(order) {
  if (!order) return { eligible: false, reason: "Order not found." };
  if (order.status !== "Completed") return { eligible: false, reason: "Only completed orders earn points." };
  if (order.paymentStatus !== "Paid") return { eligible: false, reason: "Payment has not been confirmed." };
  const points = pointsForTotal(order.total);
  if (points < 1) return { eligible: false, reason: `Orders under ₱${PESOS_PER_POINT} do not earn points.` };
  return { eligible: true, points };
}

/**
 * Award points for a finished order, at most once per order.
 * The unique index on LoyaltyTransaction (order + "earned") makes this safe even if two requests
 * (for example "mark paid" and "mark delivered") finish the same order at the same moment.
 * Sets order.rewardPointsGranted in memory; the caller saves the order as it already does.
 */
export async function awardLoyaltyPoints(order, { at } = {}) {
  if (order.rewardPointsGranted) return { awarded: false, reason: "Points were already awarded for this order." };
  const check = checkLoyaltyEligibility(order);
  if (!check.eligible) return { awarded: false, reason: check.reason };

  const customerId = order.customer?._id || order.customer;
  let entry;
  try {
    entry = await LoyaltyTransaction.create({
      customer: customerId,
      order: order._id,
      type: "earned",
      points: check.points,
      description: `Earned from order ${order.orderNumber}`,
      orderNumber: order.orderNumber,
      orderTotal: order.total,
      ...(at ? { createdAt: at, updatedAt: at } : {})
    });
  } catch (error) {
    if (error?.code === 11000) { order.rewardPointsGranted = true; return { awarded: false, reason: "Points were already awarded for this order." }; }
    throw error;
  }

  let customer;
  try {
    customer = await User.findByIdAndUpdate(customerId, { $inc: { loyaltyPoints: check.points } }, { new: true }).select("loyaltyPoints");
    if (!customer) throw new Error("Customer account not found.");
  } catch (error) {
    await LoyaltyTransaction.deleteOne({ _id: entry._id }).catch(() => {}); // nothing was credited, so drop the entry
    throw error;
  }
  await LoyaltyTransaction.updateOne({ _id: entry._id }, { $set: { balanceAfter: customer.loyaltyPoints } })
    .catch((error) => console.error("Could not store loyalty balance snapshot:", error.message));
  order.rewardPointsGranted = true;

  await AuditLog.create({ actorName: "System", action: "loyalty.awarded", entityType: "Order", entityId: String(order._id), details: `${order.orderNumber}: +${check.points} point(s), balance ${customer.loyaltyPoints}` })
    .catch(() => {});
  publish("loyalty.earned", { orderNumber: order.orderNumber, points: check.points, balance: customer.loyaltyPoints }, { userIds: [String(customerId)] });
  return { awarded: true, points: check.points, balance: customer.loyaltyPoints };
}

/**
 * Deduct points from a customer's balance. Redemption is not offered in the app yet (there is no
 * approved reward catalogue), so no route calls this. It is here so that when redemption is added
 * the balance check is atomic: the deduction only happens if enough points are still available.
 */
export async function redeemLoyaltyPoints({ customerId, points, description = "Points redeemed", order = null }) {
  const amount = Number(points);
  if (!Number.isInteger(amount) || amount < 1) throw Object.assign(new Error("Enter a whole number of points to redeem."), { status: 400 });
  const customer = await User.findOneAndUpdate(
    { _id: customerId, loyaltyPoints: { $gte: amount } },
    { $inc: { loyaltyPoints: -amount } },
    { new: true }
  ).select("loyaltyPoints");
  if (!customer) throw Object.assign(new Error("Not enough loyalty points to redeem that amount."), { status: 400 });
  try {
    const entry = await LoyaltyTransaction.create({ customer: customerId, order: order?._id ?? null, type: "redeemed", points: -amount, balanceAfter: customer.loyaltyPoints, description, orderNumber: order?.orderNumber || "", orderTotal: order?.total ?? null });
    return { balance: customer.loyaltyPoints, entry };
  } catch (error) {
    await User.updateOne({ _id: customerId }, { $inc: { loyaltyPoints: amount } }); // could not record it, so give the points back
    throw error;
  }
}

/** Balance, lifetime totals and a page of history for one customer. */
export async function getLoyaltySummary(customer, { page = 1, limit = 20 } = {}) {
  const filter = { customer: customer._id };
  const [total, transactions, totals] = await Promise.all([
    LoyaltyTransaction.countDocuments(filter),
    LoyaltyTransaction.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    LoyaltyTransaction.aggregate([{ $match: filter }, { $group: { _id: "$type", points: { $sum: "$points" } } }])
  ]);
  const sum = (type) => totals.find((row) => row._id === type)?.points || 0;
  return {
    balance: customer.loyaltyPoints || 0,
    earned: sum("earned"),
    redeemed: Math.abs(sum("redeemed")),
    pesosPerPoint: PESOS_PER_POINT,
    transactions,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit))
  };
}
