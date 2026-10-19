import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, SlidersHorizontal, Package, Boxes, TriangleAlert, Search, Download, Wallet, History, KeyRound, Power, Users, Bike, Star, ShieldCheck, Clock3, Undo2, CheckCircle2, ArrowDownUp } from "lucide-react";
import { useApp } from "../ctx";
import { useUI, PageHead, Card, Status, Empty, Pager, Tabs, Field, Modal, Avatar, Stars, Drop, SearchBox } from "../ui";
import { money, fmtDate, fmtDateTime, PRODUCT_TYPES, exportCsv, ACTIVE } from "../lib";
import { getProductImage } from "../config";

/* ---------------- Inventory ---------------- */
const BLANK = { name: "", type: "Purified Water", price: "50", stock: "30", lowStockThreshold: "10", unit: "gallon" };
export function InventoryPage() {
  const { data, actions } = useApp(); const { confirm } = useUI();
  const [tab, setTab] = useState("products"); const [form, setForm] = useState(null); const [editId, setEditId] = useState(null); const [adj, setAdj] = useState(null); const [q, setQ] = useState(""); const [imageFile, setImageFile] = useState(null); const [imagePreview, setImagePreview] = useState("");
  useEffect(() => () => { if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview); }, [imagePreview]);
  const P = data.products; const low = P.filter(p => p.stock <= p.lowStockThreshold); const units = P.reduce((s, p) => s + p.stock, 0); const value = P.reduce((s, p) => s + p.stock * p.price, 0);
  const rows = P.filter(p => `${p.name} ${p.type}`.toLowerCase().includes(q.toLowerCase()));
  const closeForm = () => { setForm(null); setImageFile(null); setImagePreview(""); };
  const openNew = () => { setEditId(null); setImageFile(null); setImagePreview(""); setForm({ ...BLANK }); };
  const openEdit = (p) => { setEditId(p._id); setImageFile(null); setImagePreview(getProductImage(p)); setForm({ name: p.name, type: p.type, price: String(p.price), stock: String(p.stock), lowStockThreshold: String(p.lowStockThreshold ?? 10), unit: p.unit || "gallon" }); };
  function handleImageChange(event) {
    const file = event.target.files?.[0] || null;
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : "");
  }
  async function save(e) {
    e.preventDefault();
    const body = new FormData();
    Object.entries({ ...form, price: Number(form.price), stock: Number(form.stock), lowStockThreshold: Number(form.lowStockThreshold) }).forEach(([key, value]) => body.append(key, String(value)));
    if (imageFile) body.append("productImage", imageFile);
    const ok = await actions.saveProduct(editId, body);
    if (ok) closeForm();
  }
  async function remove(p) { if (await confirm({ title: `Delete ${p.name}?`, body: "It will be removed from active Inventory and moved to the Archive. Its details, stock count and image are kept, and you can restore it from the Archive at any time. Past orders keep their history.", confirmText: "Delete product", danger: true })) actions.deleteProduct(p._id); }
  async function saveAdj(e) { e.preventDefault(); const ok = await actions.adjustStock(adj.p._id, Number(adj.change), adj.reason); if (ok) setAdj(null); }
  return <div className="stack">
    <PageHead eyebrow="Operations" title="Inventory" text="Track stock, receive new supplies and review every movement."><SearchBox q={q} setQ={setQ} ph="Search products…" /><button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Add product</button></PageHead>
    <div className="kpis kpis-3">
      <article className="kpi tone-blue"><span className="kpi-icon"><Package size={20} /></span><small>Active products</small><b>{P.length}</b><em>In the catalog</em></article>
      <article className="kpi tone-green"><span className="kpi-icon"><Boxes size={20} /></span><small>Units in stock</small><b>{units}</b><em>Stock value {money(value)}</em></article>
      <article className={`kpi ${low.length ? "tone-red" : "tone-violet"}`}><span className="kpi-icon"><TriangleAlert size={20} /></span><small>Low stock</small><b>{low.length}</b><em>{low.length ? low.map(p => p.name.split(" (")[0]).join(", ") : "All healthy"}</em></article>
    </div>
    <Tabs value={tab} onChange={setTab} items={[["products", "Products", P.length], ["history", "Stock history", data.inventoryLogs.length]]} />
    {tab === "products" ? <div className="inv-grid">{rows.map(p => { const pct = Math.min(100, p.stock / Math.max(1, p.lowStockThreshold * 4) * 100); const isLow = p.stock <= p.lowStockThreshold; const image = getProductImage(p);
      return <article key={p._id} className={`inv-card ${isLow ? "low" : ""}`}><header>{image ? <img className="inv-product-photo" src={image} alt={p.name} loading="lazy" /> : <span className="inv-ic"><Drop size={26} /></span>}<div><h3>{p.name}</h3><small>{p.type}</small></div>{isLow && <span className="badge badge-cancelled"><i />Low</span>}</header>
        <div className="inv-stock"><b>{p.stock}</b><span>{p.unit}s in stock</span></div><div className="meter"><i style={{ width: `${pct}%` }} /></div>
        <div className="inv-meta"><span>{money(p.price)} / {p.unit}</span><span>Alert ≤ {p.lowStockThreshold}</span></div><small className="sub">Updated {fmtDateTime(p.updatedAt)}</small>
        <footer><button className="btn btn-outline btn-sm" onClick={() => setAdj({ p, change: "10", reason: "Restock" })}><SlidersHorizontal size={14} /> Adjust</button><button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}><Pencil size={14} /> Edit</button><button className="btn btn-danger-ghost btn-sm" title="Delete product" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}><Trash2 size={14} /></button></footer></article>; })}
      {!rows.length && <Card><Empty icon={Package} title="No products found" action={<button className="btn btn-primary" onClick={openNew}>Add product</button>} /></Card>}</div>
    : <Card pad={false}>{data.inventoryLogs.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Product</th><th>Change</th><th>Balance</th><th>Reason</th><th>By</th></tr></thead><tbody>
      {data.inventoryLogs.map(l => <tr key={l._id}><td>{fmtDateTime(l.createdAt)}</td><td><b>{l.productName}</b></td><td><span className={l.change > 0 ? "ok-text" : "warn-text"}><b>{l.change > 0 ? "+" : ""}{l.change}</b></span></td><td>{l.balanceAfter}</td><td>{l.reason}</td><td>{l.actor?.name || "System"}</td></tr>)}</tbody></table></div> : <Empty icon={History} title="No stock movements yet" />}</Card>}

    {form && <Modal title={editId ? "Edit product" : "Add product"} onClose={closeForm} footer={<><button className="btn btn-ghost" onClick={closeForm}>Cancel</button><button className="btn btn-primary" form="prod-form">{editId ? "Save changes" : "Add product"}</button></>}>
      <form id="prod-form" className="form-grid" onSubmit={save}>
        <div className="full"><Field label="Product name"><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Purified Water (5 Gallon)" /></Field></div>
        <Field label="Type"><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{PRODUCT_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Unit"><input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="gallon, piece, pack" /></Field>
        <Field label="Price (₱)"><input type="number" min="0" step="0.01" required value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></Field>
        <Field label="Stock quantity"><input type="number" min="0" step="1" required value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></Field>
        <div className="full"><Field label="Low-stock alert level" hint="You'll be alerted when stock falls to this number."><input type="number" min="0" step="1" required value={form.lowStockThreshold} onChange={e => setForm({ ...form, lowStockThreshold: e.target.value })} /></Field></div>
        <div className="full"><Field label="Product image"><input type="file" accept="image/*" onChange={handleImageChange} /></Field>{imagePreview && <img className="product-upload-preview" src={imagePreview} alt="Product image preview" />}</div>
      </form></Modal>}
    {adj && <Modal title="Adjust stock" subtitle={adj.p.name} small onClose={() => setAdj(null)} footer={<><button className="btn btn-ghost" onClick={() => setAdj(null)}>Cancel</button><button className="btn btn-primary" form="adj-form">Save adjustment</button></>}>
      <form id="adj-form" className="form-grid" onSubmit={saveAdj}><div className="full adj-now">Current stock <b>{adj.p.stock}</b> → new stock <b>{Math.max(0, adj.p.stock + (Number(adj.change) || 0))}</b></div>
        <Field label="Change" hint="Use a negative number to remove stock."><input type="number" step="1" required value={adj.change} onChange={e => setAdj({ ...adj, change: e.target.value })} /></Field>
        <Field label="Reason"><select value={["Restock", "Damaged / leaking", "Count correction", "Sample / giveaway"].includes(adj.reason) ? adj.reason : "Other"} onChange={e => setAdj({ ...adj, reason: e.target.value })}>{["Restock", "Damaged / leaking", "Count correction", "Sample / giveaway", "Other"].map(r => <option key={r}>{r}</option>)}</select></Field></form></Modal>}
  </div>;
}

/* ---------------- Payments ---------------- */
export function PaymentsPage() {
  const { data, actions } = useApp(); const [tab, setTab] = useState("all"); const [q, setQ] = useState(""); const [page, setPage] = useState(1); const SIZE = 10;
  const P = data.payments; const paid = P.filter(p => p.status === "Paid"); const pend = P.filter(p => p.status === "Pending");
  const rows = P.filter(p => (tab === "all" || p.status === tab) && `${p.order?.orderNumber} ${p.customer?.name} ${p.method}`.toLowerCase().includes(q.toLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / SIZE)); const pg = Math.min(page, pages);
  return <div className="stack">
    <PageHead eyebrow="Operations" title="Payments" text="Track every transaction and confirm payments as they come in."><SearchBox q={q} setQ={v => { setQ(v); setPage(1); }} ph="Search order, customer, method…" /></PageHead>
    <div className="kpis kpis-3">
      <article className="kpi tone-green"><span className="kpi-icon"><Wallet size={20} /></span><small>Collected</small><b>{money(paid.reduce((s, p) => s + p.amount, 0))}</b><em>{paid.length} paid transaction{paid.length === 1 ? "" : "s"}</em></article>
      <article className="kpi tone-amber"><span className="kpi-icon"><Clock3 size={20} /></span><small>Awaiting payment</small><b>{money(pend.reduce((s, p) => s + p.amount, 0))}</b><em>{pend.length} pending</em></article>
      <article className="kpi tone-blue"><span className="kpi-icon"><ArrowDownUp size={20} /></span><small>All transactions</small><b>{P.length}</b><em>Across all methods</em></article>
    </div>
    <Tabs value={tab} onChange={t => { setTab(t); setPage(1); }} items={[["all", "All", P.length], ["Pending", "Pending", pend.length], ["Paid", "Paid", paid.length]]} />
    <Card pad={false}>{rows.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Method</th><th>Amount</th><th>Status</th><th className="right">Action</th></tr></thead><tbody>
      {rows.slice((pg - 1) * SIZE, pg * SIZE).map(p => <tr key={p._id}><td><b>{p.order?.orderNumber || "—"}</b></td><td>{p.customer?.name || "—"}</td><td>{fmtDate(p.paidAt || p.createdAt)}</td><td>{p.method}</td><td><b>{money(p.amount)}</b></td><td><Status status={p.status} /></td>
        <td className="right">{p.status !== "Paid" ? <button className="btn btn-primary btn-sm" onClick={() => actions.setPayment(p._id, "Paid")}><CheckCircle2 size={14} /> Mark paid</button> : <button className="btn btn-ghost btn-sm" onClick={() => actions.setPayment(p._id, "Pending")}><Undo2 size={14} /> Undo</button>}</td></tr>)}</tbody></table></div> : <Empty icon={Wallet} title="No payments found" />}
      <Pager page={pg} pages={pages} onPage={setPage} total={rows.length} size={SIZE} /></Card>
  </div>;
}

/* ---------------- Reports ---------------- */
export function ReportsPage() {
  const { data } = useApp(); const [range, setRange] = useState("30");
  const since = range === "all" ? 0 : Date.now() - Number(range) * 864e5;
  const orders = data.orders.concat(data.archive).filter(o => new Date(o.createdAt) >= since);
  const valid = orders.filter(o => o.status !== "Cancelled"); const done = orders.filter(o => ["Completed", "Delivered"].includes(o.status));
  const revenue = orders.filter(o => o.paymentStatus === "Paid" && o.status !== "Cancelled").reduce((s, o) => s + o.total, 0);
  const top = useMemo(() => { const m = {}; valid.forEach(o => o.items.forEach(i => { m[i.name] = m[i.name] || { name: i.name, qty: 0, sales: 0 }; m[i.name].qty += i.quantity; m[i.name].sales += i.quantity * i.unitPrice; })); return Object.values(m).sort((a, b) => b.sales - a.sales).slice(0, 5); }, [valid.length, range]); // eslint-disable-line
  const byMethod = useMemo(() => { const m = {}; valid.forEach(o => { m[o.paymentMethod] = (m[o.paymentMethod] || 0) + o.total; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [valid.length, range]); // eslint-disable-line
  const riders = useMemo(() => { const m = {}; orders.filter(o => o.rider?.name).forEach(o => { const r = m[o.rider.name] = m[o.rider.name] || { name: o.rider.name, n: 0, r: 0, rc: 0 }; if (["Completed", "Delivered"].includes(o.status)) r.n++; if (o.customerRating) { r.r += o.customerRating; r.rc++; } }); return Object.values(m).sort((a, b) => b.n - a.n); }, [orders.length, range]); // eslint-disable-line
  const maxTop = Math.max(1, ...top.map(t => t.sales)); const maxM = Math.max(1, ...byMethod.map(m => m[1]));
  const exp = () => exportCsv(`aquaflow-orders-${new Date().toISOString().slice(0, 10)}.csv`, [["Order", "Customer", "Type", "Status", "Payment", "Method", "Total", "Rider", "Rating", "Created"], ...orders.map(o => [o.orderNumber, o.customer?.name, o.fulfillmentType, o.status, o.paymentStatus, o.paymentMethod, o.total, o.rider?.name || "", o.customerRating || "", new Date(o.createdAt).toISOString()])]);
  return <div className="stack">
    <PageHead eyebrow="Insights" title="Reports" text="Sales performance and operations at a glance."><div className="seg">{[["7", "7 days"], ["30", "30 days"], ["all", "All time"]].map(([k, l]) => <button key={k} className={range === k ? "active" : ""} onClick={() => setRange(k)}>{l}</button>)}</div><button className="btn btn-primary" onClick={exp} disabled={!orders.length}><Download size={16} /> Export CSV</button></PageHead>
    <div className="kpis">
      <article className="kpi tone-green"><small>Paid revenue</small><b>{money(revenue)}</b><em>{orders.filter(o => o.paymentStatus === "Paid" && o.status !== "Cancelled").length} paid orders</em></article>
      <article className="kpi tone-blue"><small>Orders</small><b>{orders.length}</b><em>{orders.filter(o => o.status === "Cancelled").length} cancelled</em></article>
      <article className="kpi tone-violet"><small>Delivered / completed</small><b>{done.length}</b><em>{orders.length ? Math.round(done.length / orders.length * 100) : 0}% fulfilment rate</em></article>
      <article className="kpi tone-amber"><small>Average order</small><b>{money(valid.length ? valid.reduce((s, o) => s + o.total, 0) / valid.length : 0)}</b><em>Excluding cancelled</em></article>
    </div>
    <div className="grid-2">
      <Card title="Top products" text="By sales value">{top.length ? <ul className="hbars">{top.map(t => <li key={t.name}><span><b>{t.name}</b><small>{t.qty} sold</small></span><div><i style={{ width: `${t.sales / maxTop * 100}%` }} /></div><b>{money(t.sales)}</b></li>)}</ul> : <p className="muted">No sales in this period.</p>}</Card>
      <Card title="Sales by payment method">{byMethod.length ? <ul className="hbars">{byMethod.map(([m, v]) => <li key={m}><span><b>{m}</b></span><div><i style={{ width: `${v / maxM * 100}%` }} /></div><b>{money(v)}</b></li>)}</ul> : <p className="muted">No sales in this period.</p>}</Card>
    </div>
    <Card title="Rider performance" pad={false}>{riders.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Rider</th><th>Deliveries</th><th>Rating</th></tr></thead><tbody>{riders.map(r => <tr key={r.name}><td><div className="who"><Avatar name={r.name} size={30} /><b>{r.name}</b></div></td><td>{r.n}</td><td>{r.rc ? <span className="rating-inline"><Stars value={r.r / r.rc} size={14} /> {(r.r / r.rc).toFixed(1)} <small>({r.rc})</small></span> : <span className="muted">No ratings</span>}</td></tr>)}</tbody></table></div> : <Empty icon={Bike} title="No rider activity in this period" />}</Card>
  </div>;
}

/* ---------------- Audit ---------------- */
export function AuditPage() {
  const { data } = useApp(); const [q, setQ] = useState(""); const [page, setPage] = useState(1); const SIZE = 12;
  const rows = data.auditLogs.filter(l => `${l.action} ${l.actor?.name || l.actorName} ${l.details} ${l.entityType}`.toLowerCase().includes(q.toLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / SIZE)); const pg = Math.min(page, pages);
  return <div className="stack">
    <PageHead eyebrow="Insights" title="Audit logs" text="A tamper-evident trail of important actions across the system."><SearchBox q={q} setQ={v => { setQ(v); setPage(1); }} ph="Search actions, people, details…" /></PageHead>
    <Card pad={false}>{rows.length ? <div className="table-wrap"><table className="table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>
      {rows.slice((pg - 1) * SIZE, pg * SIZE).map(l => <tr key={l._id}><td className="nowrap">{fmtDateTime(l.createdAt)}</td><td><b>{l.actor?.name || l.actorName || "System"}</b></td><td><span className="chip mono">{l.action}</span></td><td>{l.entityType}</td><td>{l.details}</td></tr>)}</tbody></table></div> : <Empty icon={ShieldCheck} title="No audit events found" />}
      <Pager page={pg} pages={pages} onPage={setPage} total={rows.length} size={SIZE} /></Card>
  </div>;
}

/* ---------------- Accounts ---------------- */
export function AccountsPage() {
  const { data, actions, user: me } = useApp(); const { confirm } = useUI();
  const [q, setQ] = useState(""); const [role, setRole] = useState("all"); const [page, setPage] = useState(1); const SIZE = 8;
  const [add, setAdd] = useState(null); const [reset, setReset] = useState(null); const [view, setView] = useState(null);
  const U = data.users; const count = (r) => U.filter(u => u.role === r).length;
  const rows = U.filter(u => (role === "all" || u.role === role) && `${u.name} ${u.email} ${u.phone || ""}`.toLowerCase().includes(q.toLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / SIZE)); const pg = Math.min(page, pages);
  async function create(e) { e.preventDefault(); const ok = await actions.createAccount(add); if (ok) setAdd(null); }
  async function doReset(e) { e.preventDefault(); const ok = await actions.resetPassword(reset.u._id, reset.password); if (ok) setReset(null); }
  async function toggle(u) { if (u.active && !(await confirm({ title: `Deactivate ${u.name}?`, body: "They'll be signed out and can appeal within 7 days. After that the account may be permanently deleted.", confirmText: "Deactivate", danger: true }))) return; actions.toggleUser(u); }
  return <div className="stack">
    <PageHead eyebrow="People" title="Accounts" text="Customers, riders and staff. Roles and addresses are protected."><SearchBox q={q} setQ={v => { setQ(v); setPage(1); }} ph="Search name, email, phone…" /><button className="btn btn-primary" onClick={() => setAdd({ name: "", email: "", password: "", role: "customer", phone: "", address: "" })}><Plus size={16} /> Add account</button></PageHead>
    <Tabs value={role} onChange={r => { setRole(r); setPage(1); }} items={[["all", "All", U.length], ["customer", "Customers", count("customer")], ["rider", "Riders", count("rider")], ["admin", "Admins", count("admin")]]} />
    <Card pad={false}>{rows.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Account</th><th>Role</th><th>Contact</th><th>Joined</th><th>Status</th><th className="right">Actions</th></tr></thead><tbody>
      {rows.slice((pg - 1) * SIZE, pg * SIZE).map(u => <tr key={u._id}>
        <td><div className="who"><Avatar name={u.name} size={34} /><span><b>{u.name}</b><small className="sub">{u.email}</small></span></div></td>
        <td><span className="chip">{u.role}</span>{u.role === "customer" && <small className="sub">{u.loyaltyPoints || 0} pts</small>}</td>
        <td>{u.phone || <span className="muted">—</span>}{u.role === "customer" && <small className="sub clip">{u.address || "No address"}{u.addressConfirmed ? " ✓" : ""}</small>}</td>
        <td>{fmtDate(u.createdAt)}</td><td><Status status={u.active ? "Active" : "Inactive"} /></td>
        <td className="right"><div className="row-actions">
          <button className="btn btn-ghost btn-sm" title="Reset password" onClick={() => setReset({ u, password: "" })}><KeyRound size={14} /></button>
          {String(u._id) !== String(me.id) && <button className={`btn btn-sm ${u.active ? "btn-danger-ghost" : "btn-outline"}`} onClick={() => toggle(u)}><Power size={14} /> {u.active ? "Deactivate" : "Reactivate"}</button>}</div></td></tr>)}</tbody></table></div> : <Empty icon={Users} title="No accounts found" />}
      <Pager page={pg} pages={pages} onPage={setPage} total={rows.length} size={SIZE} /></Card>

    {add && <Modal title="Add account" subtitle="The role can't be changed after creation." onClose={() => setAdd(null)} footer={<><button className="btn btn-ghost" onClick={() => setAdd(null)}>Cancel</button><button className="btn btn-primary" form="acc-form">Create account</button></>}>
      <form id="acc-form" className="form-grid" onSubmit={create}>
        <Field label="Full name"><input required value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} /></Field>
        <Field label="Role"><select value={add.role} onChange={e => setAdd({ ...add, role: e.target.value })}><option value="customer">Customer</option><option value="rider">Rider</option><option value="admin">Admin</option></select></Field>
        <div className="full"><Field label="Email"><input type="email" required value={add.email} onChange={e => setAdd({ ...add, email: e.target.value })} /></Field></div>
        <div className="full"><Field label="Temporary password" hint="12+ characters with a number and a symbol."><input required minLength={12} pattern="(?=.*[0-9])(?=.*[^A-Za-z0-9]).{12,}" title="Use at least 12 characters, including a number and a symbol." value={add.password} onChange={e => setAdd({ ...add, password: e.target.value })} /></Field></div>
        <Field label="Phone"><input value={add.phone} onChange={e => setAdd({ ...add, phone: e.target.value })} /></Field>
        <Field label="Address"><input value={add.address} onChange={e => setAdd({ ...add, address: e.target.value })} /></Field></form></Modal>}
    {reset && <Modal title="Reset password" subtitle={`${reset.u.name} · ${reset.u.email}`} small onClose={() => setReset(null)} footer={<><button className="btn btn-ghost" onClick={() => setReset(null)}>Cancel</button><button className="btn btn-primary" form="rst-form">Reset password</button></>}>
      <form id="rst-form" onSubmit={doReset}><Field label="New temporary password" hint="Share it securely. They can change it from their profile."><input required minLength={12} pattern="(?=.*[0-9])(?=.*[^A-Za-z0-9]).{12,}" title="Use at least 12 characters, including a number and a symbol." value={reset.password} onChange={e => setReset({ ...reset, password: e.target.value })} /></Field></form></Modal>}
  </div>;
}

/* ---------------- Riders ---------------- */
export function RidersPage() {
  const { data } = useApp();
  const riders = data.users.filter(u => u.role === "rider");
  return <div className="stack">
    <PageHead eyebrow="People" title="Riders" text="View rider availability, workload and customer ratings. Riders manage their own availability." />
    {riders.length ? <div className="rider-grid">{riders.map(r => {
      const mine = data.orders.filter(o => String(o.rider?._id || o.rider) === String(r._id)); const active = mine.filter(o => ACTIVE.includes(o.status)).length; const rated = mine.filter(o => o.customerRating); const avg = rated.length ? rated.reduce((s, o) => s + o.customerRating, 0) / rated.length : 0;
      const status = active > 0 ? "Busy" : (r.riderStatus || "Away");
      return <article key={r._id} className="rider-card"><header><Avatar name={r.name} size={50} /><div><h3>{r.name}</h3><small>{r.phone || r.email}</small></div><span className={`rs rs-${status.toLowerCase()}`}>{status}</span></header>
        <div className="rider-stats"><div><b>{active}</b><small>Active</small></div><div><b>{mine.filter(o => ["Delivered", "Completed"].includes(o.status)).length}</b><small>Delivered</small></div><div><b>{rated.length ? avg.toFixed(1) : "—"}</b><small>Rating</small></div></div>
        {!r.active && <p className="warn-text">Account deactivated</p>}
        <small className="muted">Availability is managed by the rider. Busy status is based on active deliveries.</small></article>; })}</div>
      : <Card><Empty icon={Bike} title="No rider accounts yet" text="Create a rider from Accounts → Add account." /></Card>}
  </div>;
}
