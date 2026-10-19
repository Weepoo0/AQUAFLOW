import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Order from "../models/Order.js";
import { protect } from "../middleware/auth.js";
import { publish } from "../realtime.js";
const router = Router();

const safeUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone, address: u.address, addressConfirmed: u.addressConfirmed, optionalAddress: u.optionalAddress, optionalAddressConfirmed: u.optionalAddressConfirmed, addressLatitude: u.addressLatitude, addressLongitude: u.addressLongitude, optionalAddressLatitude: u.optionalAddressLatitude, optionalAddressLongitude: u.optionalAddressLongitude, loyaltyPoints: u.loyaltyPoints || 0, riderStatus: u.riderStatus });
const sign = (u) => jwt.sign({ id: u._id, role: u.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, phone, address } = req.body;
    if (!name || !email || !password || password.length < 12 || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) return res.status(400).json({ message: "Use a password with at least 12 characters, including a number and a symbol." });
    if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: "Email is already registered." });
    const user = await User.create({ name: String(name).trim(), email, password: await bcrypt.hash(password, 12), phone: phone || "", address: address || "", role: "customer" });
    res.status(201).json({ token: sign(user), user: safeUser(user) });
  } catch (e) { next(e); }
});
router.post("/login", async (req, res, next) => {
  try {
    const user = await User.findOne({ email: String(req.body.email || "").toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body.password || "", user.password))) return res.status(401).json({ message: "Incorrect email or password." });
    if (!user.active) return res.status(403).json({ message: "This account is deactivated. Contact the administrator within 7 days to appeal before the scheduled deletion date." });
    res.json({ token: sign(user), user: safeUser(user) });
  } catch (e) { next(e); }
});
router.patch("/rider-status", protect, async (req, res, next) => {
  try {
    if (req.user.role !== "rider") return res.status(403).json({ message: "Only riders can set availability." });
    if (!["Ready", "Away"].includes(req.body.status)) return res.status(400).json({ message: "Choose Ready or Away." });
    const activeDelivery = await Order.exists({
      rider: req.user._id,
      status: { $nin: ["Delivered", "Completed", "Cancelled"] }
    });
    if (activeDelivery) return res.status(409).json({ message: "Availability can't be changed while you have an active delivery." });
    const user = await User.findByIdAndUpdate(req.user._id, { riderStatus: req.body.status }, { new: true }).select("-password");
    publish("rider.status", { riderId: String(user._id), status: user.riderStatus }, { roles: ["admin"] });
    res.json({ user: safeUser(user) });
  } catch (e) { next(e); }
});
router.put("/password", protect, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!(await bcrypt.compare(currentPassword || "", user.password))) return res.status(400).json({ message: "Your current password is incorrect." });
    if (!newPassword || newPassword.length < 12 || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) return res.status(400).json({ message: "Use a password with at least 12 characters, including a number and a symbol." });
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: "Password updated." });
  } catch (e) { next(e); }
});
router.get("/me", protect, (req, res) => res.json({ user: safeUser(req.user) }));
router.put("/profile", protect, async (req, res, next) => {
  try {
    const { name, phone, address, addressConfirmed, optionalAddress, optionalAddressConfirmed, addressLatitude, addressLongitude, optionalAddressLatitude, optionalAddressLongitude } = req.body;
    const updates = {}; if (name?.trim()) updates.name = name.trim(); if (phone !== undefined) updates.phone = String(phone).trim();
    if (req.user.role === "customer") {
      if (address !== undefined) {
        if (req.user.addressConfirmed && address.trim() !== req.user.address.trim()) return res.status(400).json({ message: "Your confirmed main address is locked and cannot be changed. Use your optional address for another delivery location." });
        if (addressConfirmed !== true) return res.status(400).json({ message: "Please confirm your main address before saving." });
        updates.address = address.trim(); updates.addressConfirmed = true;
      }
      if (optionalAddress !== undefined) {
        if (optionalAddress.trim() && optionalAddressConfirmed !== true) return res.status(400).json({ message: "Please confirm your optional address before saving." });
        updates.optionalAddress = optionalAddress.trim(); updates.optionalAddressConfirmed = Boolean(optionalAddress.trim());
        updates.optionalAddressLatitude = optionalAddressLatitude ?? null; updates.optionalAddressLongitude = optionalAddressLongitude ?? null;
      }
      if (addressLatitude !== undefined) updates.addressLatitude = addressLatitude;
      if (addressLongitude !== undefined) updates.addressLongitude = addressLongitude;
    }
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true }).select("-password");
    res.json({ user: safeUser(user) });
  } catch (e) { next(e); }
});
// A real password reset requires a verified email flow; this endpoint intentionally avoids exposing account existence.
router.post("/appeal", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const message = String(req.body.message || "").trim().slice(0, 1000);
    if (!email || !message) return res.status(400).json({ message: "Enter the account email and an appeal message." });
    const user = await User.findOne({ email, active: false, deletionScheduledAt: { $gt: new Date() } });
    if (!user) return res.status(404).json({ message: "No eligible deactivated account was found. Please contact the system administrator." });
    user.appealRequestedAt = new Date();
    user.appealMessage = message;
    await user.save();
    res.json({ message: "Appeal submitted. Please contact the system administrator for follow-up." });
  } catch (e) { next(e); }
});
router.post("/forgot-password", (_req, res) => res.json({ message: "If the account exists, password recovery instructions would be sent when email delivery is configured." }));
export default router;
