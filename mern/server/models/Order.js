import mongoose from "mongoose";
const itemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  name: { type: String, required: true },
  productType: { type: String, enum: ["Purified Water", "Mineral Water", "Empty Gallon", "Supply"] },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  
  orderNumber: { type: String, unique: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [itemSchema],
  total: { type: Number, required: true },
  deliveryAddress: { type: String, required: true },
  fulfillmentType: { type: String, enum: ["Delivery", "Pick Up"], default: "Delivery" },
  deliveryLatitude: { type: Number, default: null },
  deliveryLongitude: { type: Number, default: null },
  deliveryDate: { type: Date },
  preferredTime: { type: String, default: "8:00 AM - 12:00 PM" },
  rider: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  status: { type: String, enum: ["Pending", "Confirmed", "Preparing", "Ready for Pick Up", "Out for Delivery", "Arrived", "Delivered", "Completed", "Cancelled"], default: "Pending" },
  paymentMethod: { type: String, enum: ["Cash on Delivery", "Cash", "GCash", "Card", "Online"], default: "Cash on Delivery" },
  paymentStatus: { type: String, enum: ["Pending", "Paid"], default: "Pending" },
  archived: { type: Boolean, default: false },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  riderAcceptedAt: { type: Date, default: null },
  arrivedAt: { type: Date, default: null },
  stockRestored: { type: Boolean, default: false },
  emptyGallonsToPickup: { type: Number, min: 0, max: 100, default: 0 },
  newEmptyGallonsPurchased: { type: Number, min: 0, default: 0 },
  emptyGallonStockReserved: { type: Boolean, default: true },
  emptyGallonStockReservationInProgress: { type: Boolean, default: false },
  pickupStatus: { type: String, enum: ["Not Requested", "Pending", "Collected"], default: "Not Requested" },
  emptyGallonsStockedBack: { type: Boolean, default: false },
  customerRating: { type: Number, min: 1, max: 5, default: null },
  customerFeedback: { type: String, maxlength: 1000, default: "" },
  feedbackSubmittedAt: { type: Date, default: null },
  rewardPointsGranted: { type: Boolean, default: false },
  deliveryProofNote: { type: String, maxlength: 500, default: "" },
  deliveredTo: { type: String, maxlength: 120, default: "" },
  deliveredAt: { type: Date, default: null }
}, { timestamps: true });
orderSchema.pre("save", function(next) {
  if (!this.orderNumber) this.orderNumber = `AF-${Date.now().toString().slice(-8)}-${Math.floor(Math.random()*90+10)}`;
  next();
});
export default mongoose.model("Order", orderSchema);
