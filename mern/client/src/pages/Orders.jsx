import { useMemo, useState } from "react";
import { Search, MapPin, Phone, Recycle, Truck, ShoppingCart, Archive, Store, Clock3, CheckCircle2, RotateCcw, Download, Package, Trash2, Plus } from "lucide-react";
import { useApp } from "../ctx";
import { useUI, PageHead, Card, Status, Empty, Pager, Tabs, Avatar, SearchBox, Modal, Field } from "../ui";
import { OrderDrawer, OrderActions } from "../components/OrderDetail";
import { money, fmtDate, ACTIVE, isFinal } from "../lib";
import { getProductImage } from "../config";

const SIZE = 8;
function Toolbar({ q, setQ, placeholder = "Search order number or customer…" }) {
  return <SearchBox q={q} setQ={setQ} placeholder={placeholder} />;
}

export function OrdersPage() {
  const { data } = useApp(); const [q, setQ] = useState(""); const [tab, setTab] = useState("all"); const [page, setPage] = useState(1); const [open, setOpen] = useState(null);
  const orders = data.orders;
  const counts = useMemo(() => ({ all: orders.length, Pending: orders.filter(o => o.status === "Pending").length, active: orders.filter(o => ["Confirmed", "Preparing", "Ready for Pick Up", "Out for Delivery", "Arrived"].includes(o.status)).length, done: orders.filter(o => ["Delivered", "Completed"].includes(o.status)).length, Cancelled: orders.filter(o => o.status === "Cancelled").length }), [orders]);
  const rows = orders.filter(o => {
    const t = tab === "all" || (tab === "active" ? ["Confirmed", "Preparing", "Ready for Pick Up", "Out for Delivery", "Arrived"].includes(o.status) : tab === "done" ? ["Delivered", "Completed"].includes(o.status) : o.status === tab);
    return t && `${o.orderNumber} ${o.customer?.name || ""} ${o.deliveryAddress} ${o.status}`.toLowerCase().includes(q.toLowerCase());
  });
  const pages = Math.max(1, Math.ceil(rows.length / SIZE)); const pg = Math.min(page, pages); const view = rows.slice((pg - 1) * SIZE, pg * SIZE);
  return <div className="stack">
    <PageHead eyebrow="Operations" title="Orders" text="Review, confirm, assign and complete customer orders."><Toolbar q={q} setQ={(v) => { setQ(v); setPage(1); }} /></PageHead>
    <Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); }} items={[["all", "All", counts.all], ["Pending", "Pending", counts.Pending], ["active", "In progress", counts.active], ["done", "Delivered", counts.done], ["Cancelled", "Cancelled", counts.Cancelled]]} />
    <Card pad={false}>
      {view.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Order</th><th>Customer</th><th>Schedule</th><th>Total</th><th>Status</th><th>Rider</th><th className="right">Actions</th></tr></thead><tbody>
        {view.map(o => <tr key={o._id} className="row-click" onClick={() => setOpen(o._id)}>
          <td><b>{o.orderNumber}</b><small className="sub">{o.fulfillmentType === "Pick Up" ? <><Store size={11} /> Pick up</> : <><Truck size={11} /> Delivery</>} · {o.paymentMethod}</small></td>
          <td><div className="who"><Avatar name={o.customer?.name} size={30} /><span><b>{o.customer?.name || "Customer"}</b><small className="sub clip"><MapPin size={11} />{o.deliveryAddress}</small></span></div>{o.emptyGallonsToPickup > 0 && <small className="sub pill-sub"><Recycle size={11} /> {o.emptyGallonsToPickup} empties · {o.pickupStatus}</small>}</td>
          <td>{o.deliveryDate ? fmtDate(o.deliveryDate, { month: "short", day: "numeric" }) : fmtDate(o.createdAt, { month: "short", day: "numeric" })}<small className="sub">{o.preferredTime}</small></td>
          <td><b>{money(o.total)}</b><small className="sub"><Status status={o.paymentStatus || "Pending"} /></small></td>
          <td><Status status={o.status} />{o.status === "Preparing" && o.newEmptyGallonsPurchased > 0 && <small className="prep-table-note">📦 Prepare {o.newEmptyGallonsPurchased} new jug(s)</small>}</td>
          <td>{o.fulfillmentType === "Pick Up" ? <span className="muted">—</span> : o.rider?.name ? <>{o.rider.name}<small className="sub">{o.riderAcceptedAt ? "Accepted" : "Awaiting"}</small></> : <span className="warn-text">Unassigned</span>}</td>
          <td className="right" onClick={e => e.stopPropagation()}><OrderActions order={o} compact /></td></tr>)}
      </tbody></table></div> : <Empty icon={ShoppingCart} title="No orders match" text="Try a different filter or search term." />}
      <Pager page={pg} pages={pages} onPage={setPage} total={rows.length} size={SIZE} />
    </Card>
    {open && <OrderDrawer id={open} onClose={() => setOpen(null)} />}
  </div>;
}

function JobCard({ o, onOpen }) {
  const { role } = useApp();
  return <article className={`job ${o.riderAcceptedAt || role !== "rider" ? "" : "job-new"}`}>
    <header><div><b>{o.orderNumber}</b><small>{o.customer?.name || "Customer"}</small></div><Status status={o.status} /></header>
    <button className="job-body" onClick={() => onOpen(o._id)}>
      <span><MapPin size={14} />{o.deliveryAddress}</span>
      <span><Clock3 size={14} />{o.deliveryDate ? fmtDate(o.deliveryDate, { month: "short", day: "numeric" }) : "ASAP"} · {o.preferredTime}</span>
      {o.emptyGallonsToPickup > 0 && <span className="hl"><Recycle size={14} />Collect {o.emptyGallonsToPickup} empty gallon(s) · {o.pickupStatus}</span>}
      <span className="job-items">{o.items.map(i => `${i.name} ×${i.quantity}`).join(" · ")}</span>
    </button>
    <footer><div className="job-total"><b>{money(o.total)}</b><small>{o.paymentMethod} · {o.paymentStatus}</small></div>
      {role === "rider" && o.customer?.phone && <a className="btn btn-ghost btn-sm" href={`tel:${o.customer.phone}`}><Phone size={14} /> Call</a>}
      <OrderActions order={o} compact /></footer>
  </article>;
}

export function DeliveryPage() {
  const { data, role } = useApp(); const [open, setOpen] = useState(null); const [q, setQ] = useState(""); const [tab, setTab] = useState("active");
  const all = data.orders.filter(o => o.fulfillmentType !== "Pick Up");
  const match = o => `${o.orderNumber} ${o.customer?.name || ""} ${o.deliveryAddress}`.toLowerCase().includes(q.toLowerCase());
  if (role === "rider") {
    const act = all.filter(o => !["Completed", "Cancelled", "Delivered"].includes(o.status) && match(o));
    const hist = all.filter(o => ["Completed", "Delivered", "Cancelled"].includes(o.status) && match(o));
    return <div className="stack">
      <PageHead eyebrow="Rider workspace" title="My deliveries" text="Accept requests, update progress, collect payment and capture proof."><Toolbar q={q} setQ={setQ} /></PageHead>
      <Tabs value={tab} onChange={setTab} items={[["active", "To deliver", act.length], ["history", "History", hist.length]]} />
      {(tab === "active" ? act : hist).length ? <div className="jobs">{(tab === "active" ? act : hist).map(o => <JobCard key={o._id} o={o} onOpen={setOpen} />)}</div>
        : <Card><Empty icon={Truck} title={tab === "active" ? "No deliveries right now" : "No delivery history yet"} text={tab === "active" ? "Stay set to Ready on your dashboard and new orders will be assigned to you." : "Completed deliveries will show up here."} /></Card>}
      {open && <OrderDrawer id={open} onClose={() => setOpen(null)} />}
    </div>;
  }
  const cols = [["Pending", "New", ["Pending"]], ["Confirmed", "Confirmed", ["Confirmed"]], ["Preparing", "Preparing", ["Preparing"]], ["Out for Delivery", "On the way", ["Out for Delivery", "Arrived"]]];
  return <div className="stack">
    <PageHead eyebrow="Operations" title="Delivery board" text="Move every delivery from new order to your customer's door."><Toolbar q={q} setQ={setQ} /></PageHead>
    <div className="board">{cols.map(([k, label, st]) => { const list = all.filter(o => st.includes(o.status) && match(o)); return <section key={k} className="lane"><header><b>{label}</b><span>{list.length}</span></header>
      <div className="lane-body">{list.map(o => <article key={o._id} className="lane-card" onClick={() => setOpen(o._id)}><div><b>{o.orderNumber}</b><Status status={o.status} /></div><p>{o.customer?.name}</p><small><MapPin size={12} />{o.deliveryAddress}</small><small><Truck size={12} />{o.rider?.name || <em className="warn-text">Unassigned</em>}</small>
        <div onClick={e => e.stopPropagation()}><OrderActions order={o} compact /></div></article>)}{!list.length && <p className="lane-empty">Nothing here</p>}</div></section>; })}</div>
    {open && <OrderDrawer id={open} onClose={() => setOpen(null)} />}
  </div>;
}

/* Archive Management: pick a product or an order. The server checks eligibility and either archives it or explains why not. */
function ArchiveRecordModal({ onClose }) {
  const { data, actions } = useApp();
  const [type, setType] = useState("product"); const [id, setId] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const options = type === "product"
    ? data.products.map(p => [p._id, `${p.name} · ${p.stock} in stock`])
    : data.orders.map(o => [o._id, `${o.orderNumber} · ${o.customer?.name || "Customer"} · ${o.status}`]);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    const result = await actions.archiveRecord(type, id);
    setBusy(false);
    if (result.ok) onClose(); else setError(result.message);
  }
  return <Modal title="Archive a record" subtitle="Choose a product or an order. We'll check it can be archived first." small onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="archive-form" disabled={!id || busy}>{busy ? "Checking…" : "Archive record"}</button></>}>
    <form id="archive-form" className="form-grid" onSubmit={submit}>
      <div className="full"><Field label="Record type"><select value={type} onChange={e => { setType(e.target.value); setId(""); setError(""); }}><option value="product">Product</option><option value="order">Order</option></select></Field></div>
      <div className="full"><Field label={type === "product" ? "Product" : "Order"} hint={type === "product" ? "Products in pending or in-progress orders can't be archived." : "Only completed (paid) or cancelled orders can be archived."}>
        <select value={id} onChange={e => { setId(e.target.value); setError(""); }}><option value="">Select a {type}…</option>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
      {error && <p className="alert alert-error full" role="alert">{error}</p>}
    </form></Modal>;
}

export function ArchivePage() {
  const { data, actions } = useApp(); const { confirm } = useUI(); const [tab, setTab] = useState("orders"); const [open, setOpen] = useState(null); const [adding, setAdding] = useState(false);
  const expired = (u) => u.deletionScheduledAt && new Date(u.deletionScheduledAt) <= new Date();
  const products = data.archivedProducts || [];
  async function restoreProduct(p) { if (await confirm({ title: `Restore ${p.name}?`, body: "It will return to active Inventory with its original image and stock count.", confirmText: "Restore product" })) actions.restoreProduct(p._id); }
  async function purgeProduct(p) { if (await confirm({ title: `Permanently delete ${p.name}?`, body: "This can't be undone. The product and its uploaded image are removed for good. Past orders keep their own copy of the item name and price.", confirmText: "Delete permanently", danger: true })) actions.purgeProduct(p._id); }
  return <div className="stack">
    <PageHead eyebrow="People & records" title="Archive" text="Retained records. Restore products and orders, or recover deactivated accounts inside the 7-day window."><button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Archive a record</button></PageHead>
    <Tabs value={tab} onChange={setTab} items={[["orders", "Archived orders", data.archive.length], ["products", "Archived products", products.length], ["accounts", "Deactivated accounts", data.archivedUsers.length]]} />
    {tab === "orders" && <Card pad={false}>{data.archive.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Archived</th><th className="right">Action</th></tr></thead><tbody>
      {data.archive.map(o => <tr key={o._id} className="row-click" onClick={() => setOpen(o._id)}><td><b>{o.orderNumber}</b></td><td>{o.customer?.name || "Customer"}</td><td>{money(o.total)}</td><td><Status status={o.status} /></td><td>{fmtDate(o.archivedAt || o.updatedAt)}</td><td className="right" onClick={e => e.stopPropagation()}><button className="btn btn-outline btn-sm" onClick={() => actions.restore(o._id)}><RotateCcw size={14} /> Restore</button></td></tr>)}</tbody></table></div>
      : <Empty icon={Archive} title="No archived orders" text="Completed or cancelled orders you archive will be kept here." />}</Card>}
    {tab === "products" && <Card pad={false}>{products.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Product</th><th>Stock</th><th>Price</th><th>Archived</th><th className="right">Actions</th></tr></thead><tbody>
      {products.map(p => { const image = getProductImage(p); return <tr key={p._id}>
        <td><div className="who">{image ? <img className="arch-thumb" src={image} alt="" loading="lazy" /> : <span className="arch-thumb arch-thumb-empty"><Package size={18} /></span>}<span><b>{p.name}</b><small className="sub">{p.type}</small></span></div></td>
        <td>{p.stock} <small className="sub">{p.unit}s</small></td><td>{money(p.price)}</td>
        <td>{fmtDate(p.archivedAt || p.updatedAt)}{p.archivedBy?.name && <small className="sub">by {p.archivedBy.name}</small>}</td>
        <td className="right"><div className="row-actions"><button className="btn btn-outline btn-sm" onClick={() => restoreProduct(p)}><RotateCcw size={14} /> Restore</button><button className="btn btn-danger-ghost btn-sm" title="Delete permanently" aria-label={`Permanently delete ${p.name}`} onClick={() => purgeProduct(p)}><Trash2 size={14} /></button></div></td></tr>; })}</tbody></table></div>
      : <Empty icon={Package} title="No archived products" text="Products you delete from Inventory are kept here, and can be restored with their original image." />}</Card>}
    {tab === "accounts" && <Card pad={false}>{data.archivedUsers.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Account</th><th>Role</th><th>Deletion date</th><th>Appeal</th><th className="right">Actions</th></tr></thead><tbody>
      {data.archivedUsers.map(u => <tr key={u._id}><td><div className="who"><Avatar name={u.name} size={30} /><span><b>{u.name}</b><small className="sub">{u.email}</small></span></div></td><td><span className="chip">{u.role}</span></td><td>{fmtDate(u.deletionScheduledAt)}{expired(u) && <small className="sub warn-text">Recovery window ended</small>}</td>
        <td>{u.appealRequestedAt ? <span title={u.appealMessage}><b>Submitted</b><small className="sub clip">{u.appealMessage}</small></span> : <span className="muted">None</span>}</td>
        <td className="right"><div className="row-actions">{!expired(u) && <button className="btn btn-outline btn-sm" onClick={() => actions.restoreUser(u._id)}>Restore</button>}{expired(u) && <button className="btn btn-danger btn-sm" onClick={() => actions.deleteUser(u._id)}>Delete permanently</button>}</div></td></tr>)}</tbody></table></div>
      : <Empty icon={CheckCircle2} title="No deactivated accounts" text="Deactivated accounts appear here for 7 days before they can be deleted." />}</Card>}
    {open && <OrderDrawer id={open} onClose={() => setOpen(null)} />}
    {adding && <ArchiveRecordModal onClose={() => setAdding(false)} />}
  </div>;
}
