import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "customer", "rider"], default: "customer" },
  phone: { type: String, default: "" },
  address: { type: String, default: "" },
  addressConfirmed: { type: Boolean, default: false },
  optionalAddress: { type: String, default: "" },
  optionalAddressConfirmed: { type: Boolean, default: false },
  addressLatitude: { type: Number, default: null },
  addressLongitude: { type: Number, default: null },
  optionalAddressLatitude: { type: Number, default: null },
  optionalAddressLongitude: { type: Number, default: null },
  riderStatus: { type: String, enum: ["Ready", "Busy", "Away"], default: "Away" },
  active: { type: Boolean, default: true },
  deactivatedAt: { type: Date, default: null },
  deletionScheduledAt: { type: Date, default: null },
  appealRequestedAt: { type: Date, default: null },
  appealMessage: { type: String, default: "" },
  loyaltyPoints: { type: Number, default: 0, min: 0 }
}, { timestamps: true });
export default mongoose.model("User", userSchema);
