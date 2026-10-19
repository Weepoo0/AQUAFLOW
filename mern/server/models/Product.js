import mongoose from "mongoose";
const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ["Purified Water", "Mineral Water", "Empty Gallon", "Supply"], default: "Purified Water" },
  description: { type: String, default: "" },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  lowStockThreshold: { type: Number, default: 10 },
  unit: { type: String, default: "gallon" },
  image: { type: String, default: "/images/purified water.jpg" },
  // active === true  -> "active" product shown in Inventory and the shop
  // active === false -> "archived" product (soft-deleted): hidden from the shop, kept in the Archive module
  active: { type: Boolean, default: true },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });
productSchema.virtual("status").get(function () { return this.active ? "active" : "archived"; });
productSchema.set("toJSON", { virtuals: true });
export default mongoose.model("Product", productSchema);
