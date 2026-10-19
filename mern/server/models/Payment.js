import mongoose from "mongoose";
const paymentSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ["Cash on Delivery", "Cash", "GCash", "Card", "Online"], default: "Cash on Delivery" },
  status: { type: String, enum: ["Pending", "Paid"], default: "Pending" },
  paidAt: { type: Date, default: null }
}, { timestamps: true });
export default mongoose.model("Payment", paymentSchema);
