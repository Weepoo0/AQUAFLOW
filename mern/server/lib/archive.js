import Order from "../models/Order.js";
import Product from "../models/Product.js";
import AuditLog from "../models/AuditLog.js";
import { publish } from "../realtime.js";

// Orders in these statuses are finished. Everything else (Pending, Confirmed, Preparing,
// Out for Delivery, Arrived, Delivered-but-unpaid) is still an open transaction and must stay
// in the active lists. Remove "Completed" here if completed orders should stay in history for good.
export const ARCHIVABLE_ORDER_STATUSES = ["Completed", "Cancelled"];

const reject = (message, status = 409) => Object.assign(new Error(message), { status });
const audit = (actor, action, entityType, entityId, details) =>
  AuditLog.create({ actor: actor?._id ?? null, actorName: actor?.name || "System", action, entityType, entityId: String(entityId), details })
    .catch((error) => console.error("Could not write archive audit log:", error.message));
const notify = (message, extra = {}) => publish("archive.updated", { message, ...extra }, { roles: ["admin"] });

/* ---------------- eligibility ---------------- */

export function checkOrderEligibility(order) {
  if (!order) return { eligible: false, status: 404, message: "Order not found." };
  if (order.archived) return { eligible: false, message: `${order.orderNumber} is already in the Archive.` };
  if (!ARCHIVABLE_ORDER_STATUSES.includes(order.status)) {
    return { eligible: false, message: `${order.orderNumber} is ${order.status}. Pending and in-progress orders stay in the active orders list until they are completed or cancelled.` };
  }
  if (order.status === "Completed" && order.paymentStatus !== "Paid") {
    return { eligible: false, message: `${order.orderNumber} is completed but its payment is not confirmed yet. Confirm the payment before archiving it.` };
  }
  return { eligible: true };
}

export async function checkProductEligibility(product) {
  if (!product) return { eligible: false, status: 404, message: "Product not found." };
  if (!product.active) return { eligible: false, message: `${product.name} is already in the Archive.` };
  const open = await Order.countDocuments({ "items.product": product._id, status: { $nin: ARCHIVABLE_ORDER_STATUSES } });
  if (open > 0) {
    return { eligible: false, message: `${product.name} is part of ${open} pending or in-progress order${open === 1 ? "" : "s"}. Finish or cancel ${open === 1 ? "it" : "them"} first, then archive the product.` };
  }
  return { eligible: true };
}

/* ---------------- orders ---------------- */

export async function archiveOrder(id, actor) {
  const order = await Order.findById(id);
  const check = checkOrderEligibility(order);
  if (!check.eligible) throw reject(check.message, check.status);
  // Atomic: only flips the flag if the order is still archivable at this exact moment.
  const archived = await Order.findOneAndUpdate(
    { _id: order._id, archived: false, status: { $in: ARCHIVABLE_ORDER_STATUSES } },
    { $set: { archived: true, archivedAt: new Date(), archivedBy: actor?._id ?? null } },
    { new: true }
  );
  if (!archived) throw reject(`${order.orderNumber} changed while archiving. Refresh and try again.`);
  await audit(actor, "order.archived", "Order", archived._id, archived.orderNumber);
  notify(`${archived.orderNumber} moved to the Archive`, { kind: "order", id: String(archived._id) });
  return archived;
}

export async function restoreOrder(id, actor) {
  const order = await Order.findOneAndUpdate(
    { _id: id, archived: true },
    { $set: { archived: false, archivedAt: null, archivedBy: null } },
    { new: true }
  );
  if (!order) {
    const exists = await Order.exists({ _id: id });
    throw exists ? reject("This order is not in the Archive.") : reject("Order not found.", 404);
  }
  await audit(actor, "order.restored", "Order", order._id, order.orderNumber);
  notify(`${order.orderNumber} restored from the Archive`, { kind: "order", id: String(order._id) });
  return order;
}

/* ---------------- products (soft delete) ---------------- */

// "Delete product" in Inventory is a soft delete: the record, stock, price and image path are kept.
export async function archiveProduct(id, actor) {
  const product = await Product.findById(id);
  const check = await checkProductEligibility(product);
  if (!check.eligible) throw reject(check.message, check.status);
  const archived = await Product.findOneAndUpdate(
    { _id: product._id, active: true },
    { $set: { active: false, archivedAt: new Date(), archivedBy: actor?._id ?? null } },
    { new: true }
  );
  if (!archived) throw reject(`${product.name} is already in the Archive.`);
  // An order could have been placed in the gap between the check and the update; if so, undo.
  const recheck = await Order.countDocuments({ "items.product": archived._id, status: { $nin: ARCHIVABLE_ORDER_STATUSES } });
  if (recheck > 0) {
    await Product.updateOne({ _id: archived._id }, { $set: { active: true, archivedAt: null, archivedBy: null } });
    throw reject(`${product.name} just received a new order, so it can't be archived right now.`);
  }
  await audit(actor, "product.archived", "Product", archived._id, `${archived.name} · ${archived.stock} in stock`);
  notify(`${archived.name} moved to the Archive`, { kind: "product", id: String(archived._id) });
  return archived;
}

export async function restoreProduct(id, actor) {
  const product = await Product.findOneAndUpdate(
    { _id: id, active: false },
    { $set: { active: true, archivedAt: null, archivedBy: null } },
    { new: true }
  );
  if (!product) {
    const exists = await Product.exists({ _id: id });
    throw exists ? reject("This product is already active.") : reject("Product not found.", 404);
  }
  await audit(actor, "product.restored", "Product", product._id, `${product.name} · ${product.stock} in stock`);
  notify(`${product.name} restored to Inventory`, { kind: "product", id: String(product._id) });
  return product;
}
