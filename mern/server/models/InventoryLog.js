import mongoose from "mongoose";
const inventoryLogSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
  productName: { type: String, required: true },
  change: { type: Number, required: true },
  balanceAfter: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, maxlength: 240 },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });
export default mongoose.model("InventoryLog", inventoryLogSchema);
