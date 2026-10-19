import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import orderRoutes from "./routes/orders.js";
import adminRoutes from "./routes/admin.js";
import paymentRoutes from "./routes/payments.js";
import loyaltyRoutes from "./routes/loyalty.js";
import { attachRealtime } from "./realtime.js";

dotenv.config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error(
    "JWT_SECRET must be configured with at least 32 characters."
  );
  process.exit(1);
}

const app = express();
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
app.use(cors({ origin: (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "") }));
app.use(express.json());
app.use("/images", express.static(path.join(serverDirectory, "public", "images")));

app.get("/api/health", (_req, res) => res.json({ status: "ok", app: "AquaFlow API" }));
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/loyalty", loyaltyRoutes);
attachRealtime(app);

app.use((err, _req, res, _next) => {
  if (err.name === "CastError") return res.status(400).json({ message: "That record could not be found." });
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aquaflow")
  .then(() => app.listen(PORT, () => console.log(`AquaFlow API running on ${PORT}`)))
  .catch((err) => { console.error("MongoDB connection failed:", err.message); process.exit(1); });
