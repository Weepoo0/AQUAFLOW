import mongoose from "mongoose";

// One row per change to a customer's points balance. The User.loyaltyPoints field is the running
// balance; this collection is the record of how it got there (earned, redeemed, adjusted).
const loyaltyTransactionSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  type: { type: String, enum: ["earned", "redeemed", "adjusted"], required: true },
  // Positive when points are added, negative when they are deducted.
  points: { type: Number, required: true, validate: { validator: (n) => Number.isInteger(n) && n !== 0, message: "Points must be a non-zero whole number." } },
  balanceAfter: { type: Number, min: 0, default: null },
  description: { type: String, default: "", maxlength: 240 },
  // Snapshots so the history still reads correctly if the order is archived or removed later.
  orderNumber: { type: String, default: "" },
  orderTotal: { type: Number, default: null }
}, { timestamps: true });

loyaltyTransactionSchema.index({ customer: 1, createdAt: -1 });
// Database-level duplicate guard: an order can only ever have ONE "earned" entry,
// even if two requests try to award it at the same moment.
loyaltyTransactionSchema.index(
  { order: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: "earned", order: { $type: "objectId" } } }
);

export default mongoose.model("LoyaltyTransaction", loyaltyTransactionSchema);
