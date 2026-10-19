export const money = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const moneyShort = (n) => { n = Number(n || 0); return n >= 1000 ? `₱${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `₱${Math.round(n)}`; };
export const fmtDate = (d, o = { month: "short", day: "numeric", year: "numeric" }) => d ? new Date(d).toLocaleDateString("en-PH", o) : "—";
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—";
export const ago = (d) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(d)) / 1000));
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
};
export const initials = (name = "") => name.split(" ").filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase() || "AF";
export const slug = (s = "") => String(s).toLowerCase().replaceAll(" ", "-");

export const TIME_SLOTS = ["8:00 AM - 12:00 PM", "1:00 PM - 5:00 PM", "5:00 PM - 8:00 PM"];
export const PAY_METHODS = [
  ["Cash on Delivery", "Pay your rider in cash"],
  ["GCash", "Pay with GCash"],
  ["Card", "Credit or debit card"],
  ["Online", "Online banking"]
];
export const PRODUCT_TYPES = ["Purified Water", "Mineral Water", "Empty Gallon", "Supply"];
export const ACTIVE = ["Pending", "Confirmed", "Preparing", "Ready for Pick Up", "Out for Delivery", "Arrived"];
export const isFinal = (s) => ["Completed", "Cancelled"].includes(s);
export const stepsFor = (o) => o?.fulfillmentType === "Pick Up"
  ? ["Pending", "Confirmed", "Preparing", "Ready for Pick Up", "Completed"]
  : ["Pending", "Confirmed", "Preparing", "Out for Delivery", "Arrived", "Delivered", "Completed"];
export const STEP_LABEL = { Pending: "Order placed", Confirmed: "Confirmed", Preparing: "Preparing", "Ready for Pick Up": "Ready for Pick Up", "Out for Delivery": "On the way", Arrived: "Arrived", Delivered: "Delivered", Completed: "Completed" };

// The one next action a given role can take on an order (matches the server rules).
export function nextStep(order, role) {
  const { status, fulfillmentType: type } = order;
  if (isFinal(status)) return null;
  if (role === "rider") {
    if (!order.riderAcceptedAt) return null;
    if (["Confirmed", "Preparing"].includes(status)) return { status: "Out for Delivery", label: "Start delivery" };
    if (status === "Out for Delivery") return { status: "Arrived", label: "I've arrived" };
    if (status === "Arrived") return { status: "Delivered", label: "Mark delivered" };
    return null;
  }
  if (role !== "admin") return null;
  if (status === "Pending") return { status: "Confirmed", label: "Confirm order" };
  if (status === "Confirmed") return { status: "Preparing", label: "Start preparing" };
  if (type === "Pick Up" && status === "Preparing") return { status: "Ready for Pick Up", label: "Mark Ready for Pick Up" };
  if (type === "Pick Up" && status === "Ready for Pick Up") return { status: "Completed", label: "Mark Picked Up" };
  if (status === "Preparing") return { status: "Out for Delivery", label: "Dispatch" };
  if (status === "Out for Delivery") return { status: "Arrived", label: "Mark arrived" };
  if (status === "Arrived") return { status: "Delivered", label: "Mark delivered" };
  if (status === "Delivered") return { status: "Completed", label: "Complete order" };
  return null;
}

export function exportCsv(filename, rows) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export function printReceipt(order) {
  const esc = (v) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rows = (order.items || []).map(i => `<tr><td>${esc(i.name)}</td><td>${i.quantity}</td><td>${money(i.unitPrice)}</td><td>${money(i.quantity * i.unitPrice)}</td></tr>`).join("");
  const w = window.open("", "_blank", "width=720,height=860");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><title>Receipt ${esc(order.orderNumber)}</title><style>
  body{font:14px 'Segoe UI',Arial,sans-serif;color:#0b2533;padding:36px;max-width:640px;margin:auto}
  .brand{display:flex;align-items:center;gap:10px;font-size:26px;font-weight:800;color:#0a7bb5}.drop{width:28px;height:28px;background:linear-gradient(135deg,#38cdf5,#0a7bb5);border-radius:50% 50% 50% 50%/60% 60% 40% 40%;transform:rotate(0)}
  .muted{color:#5b7686}table{width:100%;border-collapse:collapse;margin:22px 0}th,td{padding:10px 8px;border-bottom:1px solid #dbeaf1;text-align:left}th{font-size:12px;text-transform:uppercase;color:#5b7686}
  .total{text-align:right;font-size:22px;font-weight:800}.chip{display:inline-block;padding:3px 10px;border-radius:99px;background:#d9f4fd;color:#0a5a82;font-weight:700;font-size:12px}
  </style></head><body><div class="brand"><span class="drop"></span>AquaFlow</div><p class="muted">Water Refilling Station · Official receipt</p>
  <h2 style="margin-bottom:4px">${esc(order.orderNumber)}</h2><p><span class="chip">${esc(order.status)}</span> <span class="chip">${esc(order.paymentStatus || "Pending")} · ${esc(order.paymentMethod)}</span></p>
  <p>${esc(order.fulfillmentType || "Delivery")}: ${esc(order.deliveryAddress)}<br><span class="muted">Issued ${new Date().toLocaleString("en-PH")}</span></p>
  <table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Subtotal</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="total">Total ${money(order.total)}</p><p class="muted">Thank you for choosing AquaFlow. Clean water, better service.</p>
  <script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
  w.document.close();
  return true;
}
