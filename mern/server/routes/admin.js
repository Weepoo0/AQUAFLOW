import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Payment from "../models/Payment.js";
import { protect, allow } from "../middleware/auth.js";
import { publish } from "../realtime.js";
import AuditLog from "../models/AuditLog.js";
import { archiveOrder, archiveProduct } from "../lib/archive.js";
const router = Router();
router.use(protect, allow("admin"));
const safeUserFields = "-password";
const sevenDaysFromNow = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

router.get("/audit-logs", async (_req, res, next) => {
  try { res.json(await AuditLog.find().populate("actor", "name email").sort({ createdAt: -1 }).limit(300)); }
  catch (e) { next(e); }
});
router.get("/summary", async (_req, res, next) => {
  try {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const [totalOrders, pending, completed, products, users, paid, pendingPayments, monthlySales, orderStatuses] = await Promise.all([
      Order.countDocuments({ archived: false }),
      Order.countDocuments({ status: { $in: ["Pending", "Confirmed", "Preparing", "Ready for Pick Up", "Out for Delivery", "Arrived"] }, archived: false }),
      Order.countDocuments({ status: { $in: ["Completed", "Delivered"] }, archived: false }),
      Product.find({ active: true }),
      User.countDocuments({ active: true }),
      Payment.aggregate([{ $match: { status: "Paid" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Payment.aggregate([{ $match: { status: "Pending" } }, { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }]),
      Payment.aggregate([{ $match: { status: "Paid", paidAt: { $gte: startMonth, $ne: null } } }, { $group: { _id: { year: { $year: "$paidAt" }, month: { $month: "$paidAt" } }, sales: { $sum: "$amount" }, transactions: { $sum: 1 } } }, { $sort: { "_id.year": 1, "_id.month": 1 } }]),
      Order.aggregate([{ $match: { archived: false } }, { $group: { _id: "$status", count: { $sum: 1 } } }])
    ]);
    const salesByMonth = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const found = monthlySales.find(row => row._id.year === date.getFullYear() && row._id.month === date.getMonth() + 1);
      return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: date.toLocaleDateString("en-PH", { month: "short" }), sales: found?.sales || 0, transactions: found?.transactions || 0 };
    });
    res.json({ totalOrders, pendingDeliveries: pending, completedOrders: completed, totalUsers: users, totalSales: paid[0]?.total || 0, pendingPayments: pendingPayments[0]?.total || 0, pendingPaymentCount: pendingPayments[0]?.count || 0, lowStock: products.filter(p => p.stock <= p.lowStockThreshold).length, salesByMonth, ordersByStatus: orderStatuses.map(row => ({ status: row._id, count: row.count })), recentOrders: await Order.find({ archived: false }).populate("customer", "name").sort({ createdAt: -1 }).limit(6) });
  } catch (e) { next(e); }
});

// Existing callers receive an array; optional query parameters enable paginated admin screens.
router.get("/users", async (req, res, next) => {
  try {
    const filter = {};
    if (["admin", "customer", "rider"].includes(req.query.role)) filter.role = req.query.role;
    if (req.query.status === "active") filter.active = true;
    if (req.query.status === "inactive") filter.active = false;
    if (req.query.search) filter.$or = [ { name: { $regex: String(req.query.search).slice(0, 80), $options: "i" } }, { email: { $regex: String(req.query.search).slice(0, 120), $options: "i" } }, { phone: { $regex: String(req.query.search).slice(0, 40), $options: "i" } } ];
    const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const query = User.find(filter).select(safeUserFields).sort({ createdAt: -1 });
    if (!hasPagination) return res.json(await query);
    const [total, users] = await Promise.all([User.countDocuments(filter), query.skip((page - 1) * limit).limit(limit)]);
    res.json({ users, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) { next(e); }
});
router.post("/users", async (req, res, next) => {
  try {
    const { name, email, password, role, phone, address } = req.body;
    if (!name?.trim() || !email?.trim() || !password || password.length < 12 || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) return res.status(400).json({ message: "Use a password with at least 12 characters, including a number and a symbol." });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), role: ["admin", "customer", "rider"].includes(role) ? role : "customer", phone, address });
    res.status(201).json(await User.findById(user._id).select(safeUserFields));
  } catch (e) { next(e); }
});
router.patch("/users/:id", async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (String(user._id) === String(req.user._id) && req.body.active === false) return res.status(400).json({ message: "You cannot deactivate your own admin account." });
    const { name, phone, active } = req.body;
    if (Object.prototype.hasOwnProperty.call(req.body, "role")) return res.status(403).json({ message: "Account roles cannot be edited after creation." });
    if (Object.prototype.hasOwnProperty.call(req.body, "address")) return res.status(403).json({ message: "Customer addresses are view-only in admin account overview." });
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (active === false && user.active) {
      user.active = false;
      user.deactivatedAt = new Date();
      user.deletionScheduledAt = sevenDaysFromNow();
      user.appealRequestedAt = null;
      user.appealMessage = "";
    } else if (active === true && !user.active) {
      user.active = true;
      user.deactivatedAt = null;
      user.deletionScheduledAt = null;
      user.appealRequestedAt = null;
      user.appealMessage = "";
    }
    await user.save();
    await AuditLog.create({ actor: req.user._id, actorName: req.user.name, action: user.active ? "account.reactivated" : "account.deactivated", entityType: "User", entityId: String(user._id), details: user.email });
    publish("account.updated", { userId: String(user._id), active: user.active }, { roles: ["admin"], userIds: [String(user._id)] });
    res.json(await User.findById(user._id).select(safeUserFields));
  } catch (e) { next(e); }
});
router.patch("/users/:id/password", async (req, res, next) => {
  try {
    const password = String(req.body.password || "");
    if (password.length < 12 || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) return res.status(400).json({ message: "Use a password with at least 12 characters, including a number and a symbol." });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    user.password = await bcrypt.hash(password, 12);
    await user.save();
    await AuditLog.create({ actor: req.user._id, actorName: req.user.name, action: "account.password_reset", entityType: "User", entityId: String(user._id), details: user.email });
    res.json({ message: `Password reset for ${user.name}.` });
  } catch (e) { next(e); }
});
router.get("/archived-users", async (_req, res, next) => {
  try { res.json(await User.find({ active: false, deletionScheduledAt: { $ne: null } }).select(safeUserFields).sort({ deletionScheduledAt: 1 })); } catch (e) { next(e); }
});
router.patch("/users/:id/restore", async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.deletionScheduledAt && user.deletionScheduledAt <= new Date()) return res.status(400).json({ message: "The 7-day recovery period has ended. This account can no longer be restored through this workflow." });
    user.active = true; user.deactivatedAt = null; user.deletionScheduledAt = null; user.appealRequestedAt = null; user.appealMessage = "";
    await user.save();
    publish("account.updated", { userId: String(user._id), active: true }, { roles: ["admin"], userIds: [String(user._id)] });
    res.json(await User.findById(user._id).select(safeUserFields));
  } catch (e) { next(e); }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.active || !user.deletionScheduledAt || user.deletionScheduledAt > new Date()) return res.status(400).json({ message: "An account can only be permanently deleted after its 7-day deactivation period." });
    if (String(user._id) === String(req.user._id)) return res.status(400).json({ message: "You cannot delete your own account." });
    await User.deleteOne({ _id: user._id });
    res.json({ message: "Account permanently deleted." });
  } catch (e) { next(e); }
});
// Archive Management: pick a product or an order, the server checks eligibility, then archives it or explains why not.
router.post("/archive", async (req, res, next) => {
  try {
    const { type, id } = req.body || {};
    if (!["product", "order"].includes(type)) return res.status(400).json({ message: "Choose whether to archive a product or an order." });
    if (!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Select the record you want to archive." });
    const record = type === "product" ? await archiveProduct(id, req.user) : await archiveOrder(id, req.user);
    res.json({ type, message: type === "product" ? `${record.name} was moved to the Archive.` : `${record.orderNumber} was moved to the Archive.`, record });
  } catch (e) { next(e); }
});
router.get("/archive", async (_req, res, next) => {
  try { res.json(await Order.find({ archived: true }).populate("customer", "name").sort({ updatedAt: -1 })); } catch (e) { next(e); }
});
export default router;
