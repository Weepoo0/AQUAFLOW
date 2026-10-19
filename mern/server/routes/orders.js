import { Router } from "express";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Payment from "../models/Payment.js";
import { protect, allow } from "../middleware/auth.js";
import User from "../models/User.js";
import { publish } from "../realtime.js";
import AuditLog from "../models/AuditLog.js";
import InventoryLog from "../models/InventoryLog.js";
import { finalizeIfDone, releaseRiderIfIdle } from "../lib/orderFlow.js";
import { archiveOrder, restoreOrder } from "../lib/archive.js";
const router = Router();
const isEmptyGallon = item => item.productType === "Empty Gallon" || item.type === "Empty Gallon" || item.product?.type === "Empty Gallon" || item.name === "Empty Gallon";

router.get("/", protect, async (req, res, next) => {
  try {
    const filter = { archived: false, ...(req.user.role === "admin" ? {} : req.user.role === "rider" ? { rider: req.user._id } : { customer: req.user._id }) };
    if (req.query.status && ["Pending", "Confirmed", "Preparing", "Ready for Pick Up", "Out for Delivery", "Arrived", "Delivered", "Completed", "Cancelled"].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.search) {
      const term = String(req.query.search).slice(0, 80);
      const matchingCustomers = req.user.role === "admin" ? await User.find({ name: { $regex: term, $options: "i" } }).distinct("_id") : [];
      filter.$or = [{ orderNumber: { $regex: term, $options: "i" } }, ...(req.user.role === "admin" ? [{ customer: { $in: matchingCustomers } }] : [])];
    }
    const query = Order.find(filter).populate("customer", "name email").populate("rider", "name").populate("items.product", "type").sort({ createdAt: -1 });
    if (req.query.page === undefined && req.query.limit === undefined) return res.json(await query);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const [total, orders] = await Promise.all([Order.countDocuments(filter), query.skip((page - 1) * limit).limit(limit)]);
    res.json({ orders, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) { next(e); }
});
router.post("/", protect, allow("customer"), async (req, res, next) => {
  try {
    const { items, deliveryAddress, deliveryDate, preferredTime, paymentMethod, fulfillmentType = "Delivery", deliveryLatitude, deliveryLongitude } = req.body;
    const emptyGallonsToPickup = Number(req.body.emptyGallonsToPickup || 0);
    if (!Number.isInteger(emptyGallonsToPickup) || emptyGallonsToPickup < 0 || emptyGallonsToPickup > 100) return res.status(400).json({ message: "Empty-gallon pickup must be a whole number from 0 to 100." });
    if (!Array.isArray(items) || !items.length || !deliveryAddress?.trim()) return res.status(400).json({ message: "Add at least one item and a delivery address." });
    if (!["Delivery", "Pick Up"].includes(fulfillmentType)) return res.status(400).json({ message: "Choose Delivery or Pick Up." });
    const destinationCity = typeof req.body.address?.city === "string"
      ? req.body.address.city.trim().toLowerCase().replace(/\s+city$/, "")
      : "";
    if (fulfillmentType === "Delivery" && !["mandaluyong", "pasig"].includes(destinationCity)) {
      return res.status(400).json({
        message: "Delivery Unavailable: We only deliver within the Mandaluyong and Pasig areas. For locations outside these boundaries, please switch your order method to 'Pick up at station' to claim your items at our counter."
      });
    }
    const orderItems = []; let total = 0, totalWaterOrdered = 0, newEmptyGallonsPurchased = 0;
    // Validate every line before changing any stock to avoid partial deductions.
    for (const item of items) {
      const p = await Product.findOne({ _id: item.product, active: true });
      const quantity = Number(item.quantity);
      if (!p || !Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ message: "Invalid product or quantity." });
      if (p.stock < quantity) return res.status(400).json({ message: `Not enough stock for ${p.name}.` });
      orderItems.push({ product: p._id, name: p.name, productType: p.type, quantity, unitPrice: p.price });
      if (["Mineral Water", "Purified Water"].includes(p.type)) totalWaterOrdered += quantity;
      if (p.type === "Empty Gallon") newEmptyGallonsPurchased += quantity;
      total += p.price * quantity;
    }
    if (totalWaterOrdered > 0 && totalWaterOrdered !== emptyGallonsToPickup + newEmptyGallonsPurchased) {
      return res.status(400).json({ message: `Container mismatch: ${totalWaterOrdered} water item(s) require exactly ${totalWaterOrdered} container(s); ${emptyGallonsToPickup + newEmptyGallonsPurchased} accounted for.` });
    }
    // Reserve water stock at checkout; new empty jugs are reserved when preparation starts.
    const deducted = [];
    try {
      for (const item of orderItems.filter(item => !isEmptyGallon(item))) {
        const result = await Product.updateOne({ _id: item.product, active: true, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity } });
        if (!result.modifiedCount) throw Object.assign(new Error(`Stock changed while placing your order for ${item.name}. Please try again.`), { status: 409 });
        deducted.push(item);
      }
      const normalizedMethod = paymentMethod === "Cash" ? "Cash on Delivery" : (paymentMethod || "Cash on Delivery");
      const order = await Order.create({ customer: req.user._id, items: orderItems, total, deliveryAddress: deliveryAddress.trim(), deliveryDate, preferredTime, paymentMethod: normalizedMethod, fulfillmentType, deliveryLatitude: Number.isFinite(Number(deliveryLatitude)) ? Number(deliveryLatitude) : null, deliveryLongitude: Number.isFinite(Number(deliveryLongitude)) ? Number(deliveryLongitude) : null, emptyGallonsToPickup, newEmptyGallonsPurchased, emptyGallonStockReserved: newEmptyGallonsPurchased === 0, pickupStatus: emptyGallonsToPickup > 0 ? "Pending" : "Not Requested" });
      await Payment.create({ order: order._id, customer: req.user._id, amount: total, method: normalizedMethod, status: "Pending" });
      try {
        for (const item of orderItems.filter(item => !isEmptyGallon(item))) {
          const stockProduct = await Product.findById(item.product);
          if (stockProduct) await InventoryLog.create({ product: stockProduct._id, productName: stockProduct.name, change: -item.quantity, balanceAfter: stockProduct.stock, reason: `Reserved for order ${order.orderNumber}`, actor: req.user._id });
        }
        await AuditLog.create({ actor: req.user._id, actorName: req.user.name, action: "order.created", entityType: "Order", entityId: String(order._id), details: `${order.orderNumber} · total ₱${total.toFixed(2)}` });
      } catch (logError) { console.error("Could not write order audit trail:", logError.message); }
      publish("order.created", { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status, fulfillmentType }, { roles: ["admin"] });
      if (fulfillmentType === "Delivery") {
        const readyRider = await User.findOne({ role: "rider", active: true, riderStatus: "Ready" }).sort({ createdAt: 1 });
        if (readyRider) {
          order.rider = readyRider._id; order.status = "Confirmed"; await order.save();
          publish("rider.assignment", { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status, fulfillmentType }, { userIds: [String(readyRider._id)] });
          readyRider.riderStatus = "Busy"; await readyRider.save();
        }
      }
      publish("order.created", { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status }, { userIds: [String(req.user._id)] });
      res.status(201).json(await order.populate("customer", "name email phone"));
    } catch (error) {
      // Roll back any reserved stock if a later deduction or record creation fails.
      for (const item of deducted) await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
      throw error;
    }
  } catch (e) { next(e); }
});
router.patch("/:id/status", protect, allow("admin", "rider"), async (req, res, next) => {
  try {
    const allowed = req.user.role === "admin"
      ? ["Confirmed", "Preparing", "Ready for Pick Up", "Out for Delivery", "Arrived", "Delivered", "Completed", "Cancelled"]
      : ["Out for Delivery", "Arrived", "Delivered"];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ message: "Invalid status for your role." });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (req.user.role === "rider" && (String(order.rider) !== String(req.user._id) || order.fulfillmentType === "Pick Up")) return res.status(403).json({ message: "This delivery is not assigned to you." });
    if (order.status === "Cancelled") return res.status(400).json({ message: "This order is cancelled and can no longer be changed." });
    if (order.status === "Completed") return res.status(400).json({ message: "This order is already completed." });
    if (req.body.status === "Cancelled" && ["Delivered"].includes(order.status)) return res.status(400).json({ message: "A delivered order cannot be cancelled." });
    if (order.fulfillmentType === "Pick Up" && ["Out for Delivery", "Arrived", "Delivered"].includes(req.body.status)) return res.status(400).json({ message: "Pick-up orders do not go out for delivery. Mark them Ready for Pick Up, then Completed when collected." });
    if (order.fulfillmentType === "Pick Up" && req.body.status !== "Cancelled") {
      const nextPickupStatus = {
        Pending: "Confirmed",
        Confirmed: "Preparing",
        Preparing: "Ready for Pick Up",
        "Ready for Pick Up": "Completed"
      }[order.status];
      if (req.body.status !== nextPickupStatus) {
        return res.status(400).json({ message: "Pick-up orders must be confirmed, prepared, marked Ready for Pick Up, then completed when collected." });
      }
    }
    if (req.body.status === "Preparing" && !order.emptyGallonStockReserved) {
      const claim = await Order.findOneAndUpdate(
        { _id: order._id, emptyGallonStockReserved: false, emptyGallonStockReservationInProgress: { $ne: true } },
        { $set: { emptyGallonStockReservationInProgress: true } },
        { new: true }
      );
      if (!claim) {
        const latestOrder = await Order.findById(order._id);
        if (!latestOrder?.emptyGallonStockReserved) return res.status(409).json({ message: "Empty-gallon stock reservation is already in progress. Please retry shortly." });
        order.emptyGallonStockReserved = true;
      } else {
        const quantitiesByProduct = new Map();
        for (const item of order.items.filter(isEmptyGallon)) {
          const productId = String(item.product);
          quantitiesByProduct.set(productId, (quantitiesByProduct.get(productId) || 0) + item.quantity);
        }
        const deducted = [];
        const loggedProducts = new Set();
        try {
          for (const [productId, quantity] of quantitiesByProduct) {
            const product = await Product.findOneAndUpdate(
              { _id: productId, active: true, stock: { $gte: quantity } },
              { $inc: { stock: -quantity } },
              { new: true }
            );
            if (!product) throw Object.assign(new Error("Not enough Empty Gallon stock to prepare this order."), { status: 409 });
            deducted.push({ product, quantity });
          }
          for (const { product, quantity } of deducted) {
            await InventoryLog.create({
              product: product._id,
              productName: product.name,
              change: -quantity,
              balanceAfter: product.stock,
              reason: `New empty gallons prepared for order ${order.orderNumber}`,
              actor: req.user._id
            });
            loggedProducts.add(String(product._id));
          }
          order.emptyGallonStockReserved = true;
          order.emptyGallonStockReservationInProgress = false;
          order.status = "Preparing";
          await order.save();
        } catch (error) {
          const rollbackErrors = [];
          for (const { product, quantity } of deducted) {
            try {
              const restoredProduct = await Product.findByIdAndUpdate(
                product._id,
                { $inc: { stock: quantity } },
                { new: true }
              );
              if (!restoredProduct) throw new Error(`Could not restore Empty Gallon stock for ${product.name}.`);
              if (loggedProducts.has(String(product._id))) {
                await InventoryLog.create({
                  product: restoredProduct._id,
                  productName: restoredProduct.name,
                  change: quantity,
                  balanceAfter: restoredProduct.stock,
                  reason: `Preparing stock reservation rolled back for order ${order.orderNumber}`,
                  actor: req.user._id
                });
              }
            } catch (rollbackError) {
              rollbackErrors.push(rollbackError);
            }
          }
          if (rollbackErrors.length) {
            console.error("Could not fully roll back new empty-gallon stock:", rollbackErrors);
            error.status = 500;
            error.message = "Preparing failed and empty-gallon stock could not be fully restored. Check inventory.";
          } else {
            try {
              await Order.updateOne({ _id: order._id, emptyGallonStockReserved: false }, { $set: { emptyGallonStockReservationInProgress: false } });
            } catch (releaseError) {
              console.error("Could not release empty-gallon stock reservation:", releaseError);
              error.status = 500;
              error.message = "Preparing failed and the empty-gallon reservation lock could not be released.";
            }
          }
          throw error;
        }
      }
    }
    if (req.body.status === "Cancelled" && !order.stockRestored) {
      for (const item of order.items.filter(item => !isEmptyGallon(item) || order.emptyGallonStockReserved)) {
        await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
        const stockProduct = await Product.findById(item.product);
        if (stockProduct) await InventoryLog.create({ product: stockProduct._id, productName: stockProduct.name, change: item.quantity, balanceAfter: stockProduct.stock, reason: `Stock restored from cancelled order ${order.orderNumber}`, actor: req.user._id });
      }
      order.stockRestored = true;
    }
    if (req.body.status === "Arrived") order.arrivedAt = new Date();
    order.status = req.body.status;
    if (req.body.paymentStatus && req.user.role === "admin" && ["Pending", "Paid"].includes(req.body.paymentStatus)) order.paymentStatus = req.body.paymentStatus;
    if (order.status === "Delivered") order.deliveredAt = order.deliveredAt || new Date();
    await finalizeIfDone(order);
    await order.save();
    if (["Delivered", "Completed", "Cancelled"].includes(order.status)) await releaseRiderIfIdle(order.rider, Order, order._id);
    await AuditLog.create({ actor: req.user._id, actorName: req.user.name, action: `order.${order.status.toLowerCase().replaceAll(" ", "_")}`, entityType: "Order", entityId: String(order._id), details: order.orderNumber }).catch(() => {});
    const populated = await order.populate([{ path: "customer", select: "name email phone address" }, { path: "rider", select: "name phone" }]);
    publish("order.updated", { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status }, { roles: ["admin"], userIds: [String(order.customer._id), ...(order.rider ? [String(order.rider._id)] : [])] });
    if (order.status === "Arrived") publish("delivery.arrived", { orderId: String(order._id), orderNumber: order.orderNumber }, { userIds: [String(order.customer._id)] });
    res.json(populated);
  } catch (e) { next(e); }
});
router.patch("/:id/assign-rider", protect, allow("admin"), async (req, res, next) => {
  try {
    const { riderId } = req.body;
    const [order, rider] = await Promise.all([Order.findById(req.params.id), User.findOne({ _id: riderId, role: "rider", active: true })]);
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (!rider) return res.status(400).json({ message: "Choose an active rider account." });
    if (order.fulfillmentType === "Pick Up") return res.status(400).json({ message: "Pick-up orders do not need a rider." });
    if (["Cancelled", "Completed", "Delivered"].includes(order.status)) return res.status(400).json({ message: "This order can no longer be assigned." });
    order.rider = rider._id; order.riderAcceptedAt = null;
    if (order.status === "Pending") order.status = "Confirmed";
    await order.save();
    publish("rider.assignment", { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status, emptyGallonsToPickup: order.emptyGallonsToPickup, pickupStatus: order.pickupStatus }, { userIds: [String(rider._id)] });
    publish("order.updated", { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status }, { roles: ["admin"], userIds: [String(order.customer)] });
    res.json(await order.populate([{ path: "customer", select: "name email phone address" }, { path: "rider", select: "name phone" }]));
  } catch (e) { next(e); }
});
router.patch("/:id/accept", protect, allow("rider"), async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, rider: req.user._id });
    if (!order) return res.status(404).json({ message: "No delivery request assigned to this rider." });
    if (order.riderAcceptedAt) return res.status(400).json({ message: "Delivery already accepted." });
    order.riderAcceptedAt = new Date();
    await order.save();
    await User.updateOne({ _id: req.user._id, role: "rider" }, { riderStatus: "Busy" });
    publish("rider.accepted", { orderId: String(order._id), orderNumber: order.orderNumber }, { roles: ["admin"], userIds: [String(order.customer)] });
    res.json(await order.populate([{ path: "customer", select: "name email phone address" }, { path: "rider", select: "name phone" }]));
  } catch (e) { next(e); }
});
router.patch("/:id/collect-payment", protect, allow("admin", "rider"), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (req.user.role === "rider" && String(order.rider) !== String(req.user._id)) return res.status(403).json({ message: "This delivery is not assigned to you." });
    if (order.status === "Cancelled") return res.status(400).json({ message: "This order is cancelled." });
    if (order.paymentStatus === "Paid") return res.status(400).json({ message: "This order is already paid." });
    if (req.user.role === "rider" && !["Arrived", "Delivered"].includes(order.status)) return res.status(400).json({ message: "Collect payment after arriving at the customer." });
    order.paymentStatus = "Paid";
    await Payment.findOneAndUpdate({ order: order._id }, { status: "Paid", paidAt: new Date() });
    await finalizeIfDone(order);
    await order.save();
    if (order.status === "Completed") await releaseRiderIfIdle(order.rider, Order, order._id);
    await AuditLog.create({ actor: req.user._id, actorName: req.user.name, action: "payment.collected", entityType: "Order", entityId: String(order._id), details: `${order.orderNumber} · ₱${Number(order.total).toFixed(2)}` }).catch(() => {});
    const targets = { roles: ["admin"], userIds: [String(order.customer), ...(order.rider ? [String(order.rider)] : [])] };
    publish("payment.updated", { orderNumber: order.orderNumber, status: "Paid" }, targets);
    publish("order.updated", { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status }, targets);
    res.json(await order.populate([{ path: "customer", select: "name email phone address" }, { path: "rider", select: "name phone" }]));
  } catch (e) { next(e); }
});
router.patch("/:id/pickup", protect, allow("admin", "rider"), async (req, res, next) => {
  try {
    const { pickupStatus } = req.body;
    if (!['Pending', 'Collected'].includes(pickupStatus)) return res.status(400).json({ message: "Pickup status must be Pending or Collected." });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (req.user.role === "rider" && (String(order.rider) !== String(req.user._id) || order.fulfillmentType === "Pick Up")) return res.status(403).json({ message: "This delivery is not assigned to you." });
    if (!order.emptyGallonsToPickup) return res.status(400).json({ message: "No empty-gallon pickup was requested for this order." });
    if (pickupStatus === "Collected" && !["Arrived", "Delivered", "Completed"].includes(order.status)) return res.status(400).json({ message: "Mark empty gallons collected only after arriving at the customer." });
    if (pickupStatus === "Collected" && order.pickupStatus !== "Collected" && !order.emptyGallonsStockedBack) {
      const emptyGallonProduct = await Product.findOne({ active: true, type: "Empty Gallon" }).sort({ createdAt: 1 });
      if (emptyGallonProduct) {
        emptyGallonProduct.stock += order.emptyGallonsToPickup;
        await emptyGallonProduct.save();
        await InventoryLog.create({ product: emptyGallonProduct._id, productName: emptyGallonProduct.name, change: order.emptyGallonsToPickup, balanceAfter: emptyGallonProduct.stock, reason: `Empty gallons returned from ${order.orderNumber}`, actor: req.user._id });
        await AuditLog.create({ actor: req.user._id, actorName: req.user.name, action: "inventory.empty_gallons_returned", entityType: "Order", entityId: String(order._id), details: `${order.emptyGallonsToPickup} empty gallon(s) returned from ${order.orderNumber}` });
        order.emptyGallonsStockedBack = true;
      }
    }
    order.pickupStatus = pickupStatus;
    await order.save();
    publish("inventory.updated", { orderId: String(order._id), orderNumber: order.orderNumber, pickupStatus }, { roles: ["admin"] });
    publish("pickup.updated", { orderId: String(order._id), orderNumber: order.orderNumber, pickupStatus }, { roles: ["admin"], userIds: [String(order.customer), ...(order.rider ? [String(order.rider)] : [])] });
    res.json(await order.populate([{ path: "customer", select: "name email phone address" }, { path: "rider", select: "name phone" }]));
  } catch (e) { next(e); }
});

router.patch("/:id/proof", protect, allow("admin", "rider"), async (req, res, next) => {
  try {
    const deliveredTo = String(req.body.deliveredTo || "").trim().slice(0, 120);
    const deliveryProofNote = String(req.body.note || "").trim().slice(0, 500);
    if (!deliveredTo && !deliveryProofNote) return res.status(400).json({ message: "Enter the recipient name or a delivery note." });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (req.user.role === "rider" && (String(order.rider) !== String(req.user._id) || order.fulfillmentType === "Pick Up")) return res.status(403).json({ message: "This delivery is not assigned to you." });
    if (!["Out for Delivery", "Arrived", "Delivered", "Completed"].includes(order.status)) return res.status(400).json({ message: "Delivery proof can only be recorded during or after delivery." });
    order.deliveredTo = deliveredTo;
    order.deliveryProofNote = deliveryProofNote;
    order.deliveredAt = order.deliveredAt || new Date();
    if (order.status === "Out for Delivery" || order.status === "Arrived") order.status = "Delivered";
    await finalizeIfDone(order);
    await order.save();
    if (["Delivered", "Completed"].includes(order.status)) await releaseRiderIfIdle(order.rider, Order, order._id);
    await AuditLog.create({ actor: req.user._id, actorName: req.user.name, action: "delivery.proof_recorded", entityType: "Order", entityId: String(order._id), details: `${order.orderNumber}; recipient: ${deliveredTo || "not specified"}` });
    publish("order.updated", { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status }, { roles: ["admin"], userIds: [String(order.customer), ...(order.rider ? [String(order.rider)] : [])] });
    res.json(await order.populate([{ path: "customer", select: "name email phone address" }, { path: "rider", select: "name phone" }]));
  } catch (e) { next(e); }
});

router.patch("/:id/feedback", protect, allow("customer"), async (req, res, next) => {
  try {
    const rating = Number(req.body.rating);
    const feedback = String(req.body.feedback || "").trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: "Choose a rating from 1 to 5 stars." });
    if (feedback.length > 1000) return res.status(400).json({ message: "Feedback must be 1,000 characters or fewer." });
    const order = await Order.findOne({ _id: req.params.id, customer: req.user._id, archived: false });
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (!["Delivered", "Completed"].includes(order.status)) return res.status(400).json({ message: "You can rate a delivery after it has been delivered." });
    if (order.customerRating) return res.status(409).json({ message: "Feedback has already been submitted for this order." });
    order.customerRating = rating;
    order.customerFeedback = feedback;
    order.feedbackSubmittedAt = new Date();
    await order.save();
    await AuditLog.create({ actor: req.user._id, actorName: req.user.name, action: "delivery.feedback_submitted", entityType: "Order", entityId: String(order._id), details: `${order.orderNumber}; rating: ${rating}/5${feedback ? `; feedback: ${feedback.slice(0, 300)}` : ""}` });
    publish("delivery.feedback", { orderId: String(order._id), orderNumber: order.orderNumber, rating }, { roles: ["admin"], userIds: order.rider ? [String(order.rider)] : [] });
    res.json(await order.populate([{ path: "customer", select: "name email phone address" }, { path: "rider", select: "name phone" }]));
  } catch (e) { next(e); }
});

router.patch("/:id/archive", protect, allow("admin"), async (req, res, next) => {
  try { res.json(await archiveOrder(req.params.id, req.user)); } catch (e) { next(e); }
});
router.patch("/:id/restore", protect, allow("admin"), async (req, res, next) => {
  try { res.json(await restoreOrder(req.params.id, req.user)); } catch (e) { next(e); }
});
router.patch("/:id/cancel", protect, allow("customer"), async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.user._id });
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (!["Pending", "Confirmed"].includes(order.status) || order.riderAcceptedAt) return res.status(400).json({ message: "This order is already being prepared or delivered. Please contact the station to make changes." });
    if (!order.stockRestored) {
      for (const item of order.items.filter(item => !isEmptyGallon(item) || order.emptyGallonStockReserved)) {
        await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
        const stockProduct = await Product.findById(item.product);
        if (stockProduct) await InventoryLog.create({ product: stockProduct._id, productName: stockProduct.name, change: item.quantity, balanceAfter: stockProduct.stock, reason: `Stock restored from customer-cancelled order ${order.orderNumber}`, actor: req.user._id });
      }
      order.stockRestored = true;
    }
    order.status = "Cancelled"; await order.save();
    await releaseRiderIfIdle(order.rider, Order, order._id);
    await AuditLog.create({ actor: req.user._id, actorName: req.user.name, action: "order.cancelled", entityType: "Order", entityId: String(order._id), details: order.orderNumber });
    publish("order.updated", { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status }, { roles: ["admin"], userIds: [String(req.user._id), ...(order.rider ? [String(order.rider)] : [])] });
    res.json(order);
  } catch (e) { next(e); }
});
export default router;
