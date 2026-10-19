import { useState } from "react";
import { ArrowRight, ShoppingCart, Wallet, Truck, Boxes, CheckCircle2, Star, Droplets, Gift, Package, Clock3, ChartNoAxesCombined, Power, TriangleAlert, Plus, History, UserRound } from "lucide-react";
import { useApp } from "../ctx";
import { Card, Status, Empty, Avatar, Stars, Waves, Bubbles } from "../ui";
import { BarChart, Donut } from "../components/Charts";
import { OrderDrawer } from "../components/OrderDetail";
import { money, fmtDate, ago, ACTIVE } from "../lib";

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
function Hero({ eyebrow, title, text, children }) {
  return <section className="hero"><Bubbles count={9} /><div className="hero-copy"><span className="pill-light"><i />{eyebrow}</span><h2>{title}</h2><p>{text}</p><div className="hero-actions">{children}</div></div>
    <div className="hero-art" aria-hidden="true"><Droplets size={120} strokeWidth={1.1} /></div><Waves fill="var(--foam)" /></section>;
}
const Kpi = ({ icon: Icon, label, value, sub, tone = "blue", onClick }) => <article className={`kpi tone-${tone} ${onClick ? "clickable" : ""}`} onClick={onClick}><span className="kpi-icon"><Icon size={20} /></span><small>{label}</small><b>{value}</b><em>{sub}</em></article>;

function OrderRow({ o, onOpen, showCustomer }) {
  return <button className="order-row" onClick={() => onOpen(o._id)}><span className="or-icon"><Package size={18} /></span>
    <span className="or-main"><b>{o.orderNumber}</b><small>{showCustomer ? `${o.customer?.name || "Customer"} · ` : ""}{o.items.map(i => `${i.name.replace(/ \(.*\)/, "")} ×${i.quantity}`).join(", ")}</small></span>
    <span className="or-end"><strong>{money(o.total)}</strong><Status status={o.status} /></span></button>;
}

export default function Dashboard() {
  const { role } = useApp();
  return role === "admin" ? <AdminHome /> : role === "rider" ? <RiderHome /> : <CustomerHome />;
}

function AdminHome() {
  const { data, go, user } = useApp(); const [open, setOpen] = useState(null); const s = data.summary || {};
  const low = data.products.filter(p => p.stock <= p.lowStockThreshold);
  const riders = data.users.filter(u => u.role === "rider" && u.active);
  const pending = data.orders.filter(o => o.status === "Pending");
  return <div className="stack">
    <Hero eyebrow="Station overview" title={`${greeting()}, ${user.name.split(" ")[0]}.`} text={pending.length ? `${pending.length} new order${pending.length > 1 ? "s are" : " is"} waiting for confirmation.` : "All caught up — no orders are waiting for confirmation."}>
      <button className="btn btn-glow" onClick={() => go("orders")}>Review orders <ArrowRight size={16} /></button><button className="btn btn-outline-light" onClick={() => go("inventory")}>Check inventory</button></Hero>
    <div className="kpis">
      <Kpi icon={Wallet} tone="green" label="Total sales" value={money(s.totalSales)} sub={`${money(s.pendingPayments)} awaiting payment`} onClick={() => go("payments")} />
      <Kpi icon={ShoppingCart} tone="blue" label="Total orders" value={s.totalOrders || 0} sub={`${s.completedOrders || 0} completed`} onClick={() => go("orders")} />
      <Kpi icon={Truck} tone="amber" label="In progress" value={s.pendingDeliveries || 0} sub="Orders needing action" onClick={() => go("delivery")} />
      <Kpi icon={Boxes} tone={s.lowStock ? "red" : "violet"} label="Low stock" value={s.lowStock || 0} sub={s.lowStock ? "Products to restock" : "Stock levels healthy"} onClick={() => go("inventory")} />
    </div>
    <div className="grid-2-1">
      <Card title="Monthly sales" text="Paid transactions over the last six months"><BarChart rows={s.salesByMonth || []} /></Card>
      <Card title="Orders by status" text="Current, non-archived orders"><Donut rows={s.ordersByStatus || []} /></Card>
    </div>
    <div className="grid-2-1">
      <Card title="Recent orders" action={<button className="link" onClick={() => go("orders")}>View all <ArrowRight size={14} /></button>} pad={false}>
        {data.orders.length ? <div className="order-list">{data.orders.slice(0, 6).map(o => <OrderRow key={o._id} o={o} showCustomer onOpen={setOpen} />)}</div> : <Empty icon={ShoppingCart} title="No orders yet" text="New customer orders appear here instantly." />}</Card>
      <div className="stack">
        <Card title="Riders" action={<button className="link" onClick={() => go("riders")}>Manage</button>}>
          {riders.length ? <ul className="mini-list">{riders.map(r => <li key={r._id}><Avatar name={r.name} size={32} /><span><b>{r.name}</b><small>{data.orders.filter(o => (o.rider?._id || o.rider) === r._id && ACTIVE.includes(o.status)).length} active</small></span><i className={`rs rs-${(r.riderStatus || "Away").toLowerCase()}`}>{r.riderStatus || "Away"}</i></li>)}</ul> : <p className="muted">No active riders.</p>}</Card>
        <Card title="Low stock" action={<button className="link" onClick={() => go("inventory")}>Restock</button>}>
          {low.length ? <ul className="mini-list">{low.map(p => <li key={p._id}><span className="warn-ic"><TriangleAlert size={16} /></span><span><b>{p.name}</b><small>{p.stock} left · alert at {p.lowStockThreshold}</small></span></li>)}</ul> : <p className="muted"><CheckCircle2 size={15} /> Everything is well stocked.</p>}</Card>
      </div>
    </div>
    {open && <OrderDrawer id={open} onClose={() => setOpen(null)} />}
  </div>;
}

function CustomerHome() {
  const { data, go, user, actions } = useApp(); const [open, setOpen] = useState(null);
  const mine = data.orders; const active = mine.filter(o => ACTIVE.includes(o.status)); const done = mine.filter(o => ["Completed", "Delivered"].includes(o.status));
  const last = done[0]; const pts = Number(user.loyaltyPoints || 0);
  const spent = mine.filter(o => o.status !== "Cancelled").reduce((s, o) => s + o.total, 0);
  return <div className="stack">
    <Hero eyebrow="Customer portal" title={`${greeting()}, ${user.name.split(" ")[0]}!`} text={active.length ? `You have ${active.length} order${active.length > 1 ? "s" : ""} on the way.` : "Running low? Order fresh water in a few taps."}>
      <button className="btn btn-glow" onClick={() => go("order-now")}><Plus size={16} /> Order water</button>
      {last && <button className="btn btn-outline-light" onClick={() => actions.reorder(last)}>Refill my last order</button>}</Hero>
    <div className="kpis">
      <Kpi icon={Truck} tone="blue" label="Active orders" value={active.length} sub="In progress right now" onClick={() => go("my-orders")} />
      <Kpi icon={CheckCircle2} tone="green" label="Completed" value={done.length} sub="Delivered successfully" />
      <Kpi icon={Wallet} tone="amber" label="Total spent" value={money(spent)} sub="Excluding cancelled" />
      <Kpi icon={Gift} tone="violet" label="Loyalty points" value={pts} sub="1 point per ₱100 spent" onClick={() => go("loyalty")} />
    </div>
    <div className="grid-2-1">
      <Card title={active.length ? "Your active orders" : "Recent orders"} action={<button className="link" onClick={() => go("my-orders")}>Track all <ArrowRight size={14} /></button>} pad={false}>
        {mine.length ? <div className="order-list">{(active.length ? active : mine).slice(0, 5).map(o => <OrderRow key={o._id} o={o} onOpen={setOpen} />)}</div> : <Empty icon={Droplets} title="No orders yet" text="Your first refill is just a few taps away." action={<button className="btn btn-primary" onClick={() => go("order-now")}>Place my first order</button>} />}</Card>
      <div className="stack">
        <Card title="Quick actions"><div className="shortcuts">{[["order-now", Droplets, "Order water", "Choose products & schedule"], ["my-orders", History, "My orders", "Track, rate and reorder"], ["profile", UserRound, "My profile", "Addresses & security"]].map(([k, I, t, d]) => <button key={k} onClick={() => go(k)}><span><I size={18} /></span><div><b>{t}</b><small>{d}</small></div><ArrowRight size={15} /></button>)}</div></Card>
        <section className="tip"><Droplets size={22} /><div><b>Stay hydrated</b><p>Adults need about 8 glasses of clean water a day. Reorder before your last gallon runs out!</p></div></section>
      </div>
    </div>
    {open && <OrderDrawer id={open} onClose={() => setOpen(null)} />}
  </div>;
}

function RiderHome() {
  const { data, go, user, actions } = useApp(); const [open, setOpen] = useState(null);
  const queue = data.orders.filter(o => !["Completed", "Cancelled", "Delivered"].includes(o.status));
  const done = data.orders.filter(o => ["Completed", "Delivered"].includes(o.status));
  const rated = data.orders.filter(o => o.customerRating); const avg = rated.length ? rated.reduce((s, o) => s + o.customerRating, 0) / rated.length : 0;
  const ready = user.riderStatus === "Ready" || user.riderStatus === "Busy"; const busy = user.riderStatus === "Busy";
  return <div className="stack">
    <Hero eyebrow="Rider workspace" title={`Ready to roll, ${user.name.split(" ")[0]}?`} text={queue.length ? `${queue.length} delivery${queue.length > 1 ? " requests are" : " request is"} in your queue.` : "No deliveries yet. Stay online to receive the next order automatically."}>
      <button className="btn btn-glow" onClick={() => go("delivery")}>Open deliveries <ArrowRight size={16} /></button></Hero>
    <Card className="availability"><div><span className={`power ${ready ? "on" : ""}`}><Power size={22} /></span><div><h3>{busy ? "You're on a delivery" : ready ? "You're online" : "You're away"}</h3><p>{ready ? "New orders are assigned to you automatically." : "Go online to start receiving delivery assignments."}</p></div></div>
      <div className="seg"><button className={ready ? "active" : ""} disabled={busy} onClick={() => actions.setMyStatus("Ready")}>Ready</button><button className={!ready ? "active" : ""} disabled={busy} onClick={() => actions.setMyStatus("Away")}>Away</button></div></Card>
    <div className="kpis">
      <Kpi icon={Truck} tone="blue" label="In my queue" value={queue.length} sub="Orders needing action" onClick={() => go("delivery")} />
      <Kpi icon={CheckCircle2} tone="green" label="Delivered" value={done.length} sub="Completed deliveries" />
      <Kpi icon={Star} tone="amber" label="Rating" value={rated.length ? `${avg.toFixed(1)} / 5` : "—"} sub={`${rated.length} customer review${rated.length === 1 ? "" : "s"}`} />
      <Kpi icon={ChartNoAxesCombined} tone="violet" label="Success rate" value={data.orders.length ? `${Math.round(done.length / data.orders.filter(o => o.status !== "Cancelled").length * 100) || 0}%` : "—"} sub="Delivered vs assigned" />
    </div>
    <div className="grid-2-1">
      <Card title="Delivery queue" action={<button className="link" onClick={() => go("delivery")}>Manage</button>} pad={false}>
        {queue.length ? <div className="order-list">{queue.slice(0, 5).map(o => <OrderRow key={o._id} o={o} showCustomer onOpen={setOpen} />)}</div> : <Empty icon={Truck} title="Nothing in your queue" text="You'll be notified the moment an order is assigned." />}</Card>
      <Card title="Customer feedback" text="Recent ratings for your deliveries">
        {rated.length ? <ul className="reviews">{rated.slice().sort((a, b) => new Date(b.feedbackSubmittedAt) - new Date(a.feedbackSubmittedAt)).slice(0, 4).map(o => <li key={o._id}><Stars value={o.customerRating} size={14} /><b>{o.customer?.name}</b>{o.customerFeedback && <p>“{o.customerFeedback}”</p>}<small>{o.orderNumber} · {fmtDate(o.feedbackSubmittedAt)}</small></li>)}</ul> : <p className="muted">No ratings yet. Customers can rate you after each delivery.</p>}</Card>
    </div>
    {open && <OrderDrawer id={open} onClose={() => setOpen(null)} />}
  </div>;
}
