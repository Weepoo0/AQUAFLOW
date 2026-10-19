import jwt from "jsonwebtoken";
import User from "./models/User.js";

const clients = new Map();
export function publish(event, payload = {}, targets = {}) {
  const message = `data: ${JSON.stringify({ event, payload, at: new Date().toISOString() })}\n\n`;
  for (const [res, meta] of clients.entries()) {
    const matchesUser = targets.userIds?.some(id => String(id) === String(meta.userId));
    const matchesRole = targets.roles?.includes(meta.role);
    if (!targets.userIds && !targets.roles || matchesUser || matchesRole) {
      try { res.write(message); } catch { clients.delete(res); }
    }
  }
}

export function attachRealtime(app) {
  app.get("/api/events", async (req, res) => {
    try {
      const token = String(req.query.token || "");
      if (!token) return res.status(401).end();
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.id).select("role active");
      if (!user || !user.active) return res.status(401).end();
      res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.flushHeaders?.();
      res.write(`data: ${JSON.stringify({ event: "connected", payload: { role: user.role } })}\n\n`);
      clients.set(res, { userId: String(user._id), role: user.role });
      const heartbeat = setInterval(() => { try { res.write(": keepalive\n\n"); } catch { clearInterval(heartbeat); clients.delete(res); } }, 25000);
      req.on("close", () => { clearInterval(heartbeat); clients.delete(res); });
    } catch { res.status(401).end(); }
  });
}
