import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Product from "../models/Product.js";
import { protect, allow } from "../middleware/auth.js";
import InventoryLog from "../models/InventoryLog.js";
import AuditLog from "../models/AuditLog.js";
import Order from "../models/Order.js";
import { publish } from "../realtime.js";
import { archiveProduct, restoreProduct, ARCHIVABLE_ORDER_STATUSES } from "../lib/archive.js";
const router = Router();
const imagesDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "images");
mkdirSync(imagesDirectory, { recursive: true });
const imageExtensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "image/avif": ".avif" };
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, imagesDirectory),
    filename: (_req, file, callback) => callback(null, `${Date.now()}-${randomUUID()}${imageExtensions[file.mimetype]}`)
  }),
  fileFilter: (_req, file, callback) => {
    if (!imageExtensions[file.mimetype]) return callback(Object.assign(new Error("Upload a JPEG, PNG, GIF, WebP, or AVIF image."), { status: 400 }));
    callback(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});
const receiveProductImage = (req, res, next) => upload.single("productImage")(req, res, error => {
  if (error) {
    if (error instanceof multer.MulterError) error.status = 400;
    return next(error);
  }
  next();
});
// Only these fields can be set from a form. Archive state (active / archivedAt / archivedBy) and the
// image path are changed by the archive routes and the upload handler, never copied from req.body.
const EDITABLE_FIELDS = ["name", "type", "description", "price", "stock", "lowStockThreshold", "unit"];
const pickProductFields = (body = {}) => Object.fromEntries(EDITABLE_FIELDS.filter(key => body[key] !== undefined).map(key => [key, body[key]]));
const DEFAULT_IMAGE = "/images/purified water.jpg";
const UPLOADED_IMAGE = /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|gif|webp|avif)$/i;
// Removes an uploaded image file from disk. Only used by permanent deletion, never by archiving.
async function removeUploadedImage(product) {
  const imagePath = product.image;
  if (typeof imagePath !== "string" || imagePath === DEFAULT_IMAGE || !imagePath.startsWith("/images/")) return;
  const fileName = path.basename(imagePath);
  if (!UPLOADED_IMAGE.test(fileName)) return;
  if (await Product.exists({ image: imagePath, _id: { $ne: product._id } })) return; // another product still uses it
  try { await unlink(path.join(imagesDirectory, fileName)); }
  catch (error) { if (error.code !== "ENOENT") console.error("Could not remove product image:", error.message); }
}
router.get("/logs", protect, allow("admin"), async (_req, res, next) => {
  try { res.json(await InventoryLog.find().populate("actor", "name").sort({ createdAt: -1 }).limit(200)); }
  catch (e) { next(e); }
});
router.patch("/:id/adjust", protect, allow("admin"), async (req, res, next) => {
  try {
    const change = Number(req.body.change);
    const reason = String(req.body.reason || "").trim().slice(0, 240);
    if (!Number.isInteger(change) || change === 0 || !reason) return res.status(400).json({ message: "Enter a non-zero whole-number adjustment and a reason." });
    const product = await Product.findById(req.params.id);
    if (!product || !product.active) return res.status(404).json({ message: "Active product not found." });
    if (product.stock + change < 0) return res.status(400).json({ message: "Stock cannot be negative." });
    product.stock += change;
    await product.save();
    await InventoryLog.create({ product: product._id, productName: product.name, change, balanceAfter: product.stock, reason, actor: req.user._id });
    await AuditLog.create({ actor: req.user._id, actorName: req.user.name, action: "inventory.adjusted", entityType: "Product", entityId: String(product._id), details: `${product.name}: ${change > 0 ? "+" : ""}${change}; ${reason}` });
    publish("inventory.updated", { productId: String(product._id), productName: product.name, stock: product.stock }, { roles: ["admin"] });
    res.json(product);
  } catch (e) { next(e); }
});
router.get("/archived", protect, allow("admin"), async (_req, res, next) => {
  try { res.json(await Product.find({ active: false }).populate("archivedBy", "name").sort({ archivedAt: -1, updatedAt: -1 })); } catch (e) { next(e); }
});
router.get("/", async (_req, res, next) => {
  try { res.json(await Product.find({ active: true }).sort({ name: 1 })); } catch (e) { next(e); }
});
router.post("/", protect, allow("admin"), receiveProductImage, async (req, res, next) => {
  try {
    const product = new Product({
      ...pickProductFields(req.body),
      ...(req.file ? { image: `/images/${req.file.filename}` } : {})
    });
    await product.save();
    res.status(201).json(product);
  } catch (e) { next(e); }
});
router.put("/:id", protect, allow("admin"), receiveProductImage, async (req, res, next) => {
  try {
    const p = await Product.findOneAndUpdate({ _id: req.params.id, active: true }, {
      ...pickProductFields(req.body),
      ...(req.file ? { image: `/images/${req.file.filename}` } : {})
    }, { new: true, runValidators: true });
    if (!p) return res.status(404).json({ message: "Active product not found. Restore it from the Archive to edit it." });
    res.json(p);
  } catch (e) { next(e); }
});
// "Delete product" = soft delete. The product, its stock and its image stay on record in the Archive.
router.delete("/:id", protect, allow("admin"), async (req, res, next) => {
  try {
    const product = await archiveProduct(req.params.id, req.user);
    res.json({ message: `${product.name} was moved to the Archive.`, product });
  } catch (e) { next(e); }
});
router.patch("/:id/restore", protect, allow("admin"), async (req, res, next) => {
  try {
    const product = await restoreProduct(req.params.id, req.user);
    res.json({ message: `${product.name} is back in Inventory.`, product });
  } catch (e) { next(e); }
});
// Permanent deletion is a separate, deliberate step and only works on products that are already archived.
router.delete("/:id/permanent", protect, allow("admin"), async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found." });
    if (product.active) return res.status(409).json({ message: "Archive this product first. Only archived products can be permanently deleted." });
    const open = await Order.countDocuments({ "items.product": product._id, status: { $nin: ARCHIVABLE_ORDER_STATUSES } });
    if (open > 0) return res.status(409).json({ message: `${product.name} is still part of ${open} open order${open === 1 ? "" : "s"}.` });
    await Product.deleteOne({ _id: product._id, active: false });
    await removeUploadedImage(product);
    await AuditLog.create({ actor: req.user._id, actorName: req.user.name, action: "product.deleted_permanently", entityType: "Product", entityId: String(product._id), details: product.name }).catch(() => {});
    publish("archive.updated", { message: `${product.name} was permanently deleted` }, { roles: ["admin"] });
    res.json({ message: `${product.name} was permanently deleted.` });
  } catch (e) { next(e); }
});
export default router;
