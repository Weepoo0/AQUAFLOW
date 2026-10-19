// One-time migration for databases that existed before the points history was added.
//   node scripts/backfill-loyalty.js --dry-run     (shows what would change)
//   node scripts/backfill-loyalty.js               (applies it)
// It is safe to run more than once: it never creates a second "earned" row for the same order.
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";
import Order from "../models/Order.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { pointsForTotal } from "../lib/loyalty.js";

dotenv.config();
const dryRun = process.argv.includes("--dry-run");
await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aquaflow");
await LoyaltyTransaction.init();

// 1. Orders that already gave points but have no history row yet.
let created = 0;
for (const order of await Order.find({ rewardPointsGranted: true, status: "Completed" }).lean()) {
  const points = pointsForTotal(order.total);
  if (points < 1 || await LoyaltyTransaction.exists({ order: order._id, type: "earned" })) continue;
  created++;
  if (!dryRun) await LoyaltyTransaction.create({ customer: order.customer, order: order._id, type: "earned", points, description: `Earned from order ${order.orderNumber}`, orderNumber: order.orderNumber, orderTotal: order.total, createdAt: order.updatedAt, updatedAt: order.updatedAt });
}

// 2. Make each customer's history add up to their stored balance (points from before orders were tracked, manual edits, etc.).
let adjusted = 0;
for (const customer of await User.find({ role: "customer" }).select("name loyaltyPoints")) {
  const [row] = await LoyaltyTransaction.aggregate([{ $match: { customer: customer._id } }, { $group: { _id: null, sum: { $sum: "$points" } } }]);
  const difference = (customer.loyaltyPoints || 0) - (row?.sum || 0);
  if (difference === 0) continue;
  adjusted++;
  console.log(`${customer.name}: balance ${customer.loyaltyPoints || 0}, history ${row?.sum || 0} -> adjustment ${difference > 0 ? "+" : ""}${difference}`);
  if (!dryRun) await LoyaltyTransaction.create({ customer: customer._id, type: "adjusted", points: difference, description: "Balance carried over from before points history was recorded" });
}

// 3. Fill in the running balance on every row, oldest first.
if (!dryRun) {
  for (const customerId of await LoyaltyTransaction.distinct("customer")) {
    let balance = 0;
    for (const entry of await LoyaltyTransaction.find({ customer: customerId }).sort({ createdAt: 1, _id: 1 })) {
      balance += entry.points;
      if (entry.balanceAfter !== balance) await LoyaltyTransaction.updateOne({ _id: entry._id }, { $set: { balanceAfter: Math.max(0, balance) } }, { timestamps: false });
    }
  }
}
console.log(`${dryRun ? "[dry run] " : ""}${created} order history row(s) ${dryRun ? "would be " : ""}created, ${adjusted} balance adjustment(s) ${dryRun ? "needed" : "recorded"}.`);
await mongoose.disconnect();
