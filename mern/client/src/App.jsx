import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutDashboard, ShoppingCart, Package, Truck, Wallet, Archive, Users, LogOut, Bell, Menu, X, UserRound, History, ChartNoAxesCombined, ShieldCheck, ClipboardList, Bike, Droplets, Check, Gift } from "lucide-react";
import { api, API } from "./api";
import { AppCtx } from "./ctx";
import { UIProvider, useUI, Logo, Avatar, Bubbles } from "./ui";
import { ago } from "./lib";
import Landing from "./Landing";
import Auth from "./Auth";
import Dashboard from "./pages/Dashboard";
import { OrdersPage, DeliveryPage, ArchivePage } from "./pages/Orders";
import { OrderNow, MyOrders, LoyaltyPage, Profile } from "./pages/Customer";
import { InventoryPage, PaymentsPage, ReportsPage, AuditPage, AccountsPage, RidersPage } from "./pages/Admin";

const NAV = {
  admin: [
    ["Overview", [["dashboard", "Dashboard", LayoutDashboard]]],
    ["Operations", [["orders", "Orders", ShoppingCart], ["delivery", "Delivery board", Truck], ["inventory", "Inventory", Package], ["payments", "Payments", Wallet]]],
    ["Insights", [["reports", "Reports", ChartNoAxesCombined], ["audit", "Audit logs", History]]],
    ["People", [["accounts", "Accounts", Users], ["riders", "Riders", Bike], ["archive", "Archive", Archive]]],
    ["Account", [["profile", "My profile", UserRound]]]
  ],
  rider: [["Workspace", [["dashboard", "Dashboard", LayoutDashboard], ["delivery", "My deliveries", Truck]]], ["Account", [["profile", "My profile", UserRound]]]],
  customer: [["Workspace", [["dashboard", "Home", LayoutDashboard], ["order-now", "Order water", Droplets], ["my-orders", "My orders", ClipboardList], ["loyalty", "Loyalty points", Gift]]], ["Account", [["profile", "My profile", UserRound]]]]
};
const EMPTY = { products: [], orders: [], payments: [], users: [], archive: [], archivedProducts: [], archivedUsers: [], summary: null, inventoryLogs: [], auditLogs: [] };
const pageFromHash = () => window.location.hash.replace(/^#\/?/, "") || "dashboard";

function Shell() {
  const { toast, confirm } = useUI();
  const [token, setToken] = useState(() => localStorage.getItem("af_token") || "");
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(Boolean(localStorage.getItem("af_token")));
  const [view, setView] = useState("landing");
  const [authMode, setAuthMode] = useState("login");
  const [page, setPageState] = useState(pageFromHash);
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [live, setLive] = useState(false);
  const role = user?.role;
  const reloadTimer = useRef(null);

  const go = useCallback((p) => { setPageState(p); window.location.hash = `/${p}`; setNavOpen(false); setNotesOpen(false); window.scrollTo({ top: 0 }); }, []);
  useEffect(() => { const h = () => setPageState(pageFromHash()); window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);

  const signOut = useCallback((silent) => {
    localStorage.removeItem("af_token"); setToken(""); setUser(null); setData(EMPTY); setNotes([]); setView("landing"); setLive(false);
    window.location.hash = ""; if (silent) toast("Your session expired. Please sign in again.", "info");
  }, [toast]);

  // Restore a saved session.
  useEffect(() => {
    if (!token || user) { setBooting(false); return; }
    api("/auth/me", { token }).then(r => setUser(r.user)).catch(() => { localStorage.removeItem("af_token"); setToken(""); }).finally(() => setBooting(false));
  }, []); // eslint-disable-line

  const load = useCallback(async (quiet = false) => {
    if (!token || !role) return;
    if (!quiet) setLoading(true);
    try {
      const [products, orders, payments] = await Promise.all([api("/products", { token }), api("/orders", { token }), api("/payments", { token })]);
      let extra = {};
      if (role === "admin") {
        const [summary, users, archive, archivedProducts, archivedUsers, inventoryLogs, auditLogs] = await Promise.all([api("/admin/summary", { token }), api("/admin/users", { token }), api("/admin/archive", { token }), api("/products/archived", { token }), api("/admin/archived-users", { token }), api("/products/logs", { token }), api("/admin/audit-logs", { token })]);
        extra = { summary, users, archive, archivedProducts, archivedUsers, inventoryLogs, auditLogs };
      }
      setData({ ...EMPTY, products, orders, payments, ...extra });
    } catch (e) { if (e.status === 401) signOut(true); else if (!quiet) toast(e.message, "error"); }
    finally { setLoading(false); }
  }, [token, role, signOut, toast]);
  const softReload = useCallback(() => { clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(() => load(true), 350); }, [load]);

  useEffect(() => { if (user) load(); }, [user?.id, role]); // eslint-disable-line
  useEffect(() => { if (!user) return; const t = setInterval(() => load(true), 30000); return () => clearInterval(t); }, [user?.id, load]); // eslint-disable-line

  // Real-time events (SSE) → notifications + live data.
  useEffect(() => {
    if (!token || !user) return;
    const es = new EventSource(`${API}/events?token=${encodeURIComponent(token)}`);
    es.onopen = () => setLive(true); es.onerror = () => setLive(false);
    es.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data); const p = m.payload || {}; const n = p.orderNumber;
        if (m.event === "connected") { setLive(true); return; }
        const text = {
          "order.created": role === "admin" ? `New order ${n}` : `Order ${n} placed`,
          "order.updated": `Order ${n} is now ${p.status}`,
          "rider.assignment": `New delivery assigned: ${n}${p.emptyGallonsToPickup > 0 ? ` · collect ${p.emptyGallonsToPickup} empty gallon(s)` : ""}`,
          "rider.accepted": `Rider accepted ${n}`,
          "delivery.arrived": `Your rider has arrived with ${n}!`,
          "pickup.updated": `Empty gallons for ${n}: ${p.pickupStatus}`,
          "delivery.feedback": `${p.rating}★ rating received for ${n}`,
          "payment.updated": `Payment for ${n || "an order"} is ${p.status}`,
          "inventory.updated": p.productName ? `Stock updated: ${p.productName} (${p.stock})` : `Inventory updated${n ? ` · ${n}` : ""}`,
          "archive.updated": p.message,
          "loyalty.earned": `You earned ${p.points} loyalty point${p.points === 1 ? "" : "s"} from ${n}`
        }[m.event];
        if (text) {
          const target = m.event.startsWith("payment") ? (role === "admin" ? "payments" : "my-orders") : m.event.startsWith("inventory") ? "inventory" : m.event.startsWith("loyalty") ? "loyalty" : m.event.startsWith("archive") ? "archive" : role === "customer" ? "my-orders" : role === "rider" ? "delivery" : "orders";
          setNotes(prev => [{ id: `${Date.now()}${Math.random()}`, text, at: m.at || new Date().toISOString(), read: false, target }, ...prev].slice(0, 40));
          if (["delivery.arrived", "rider.assignment", "order.created", "delivery.feedback", "loyalty.earned"].includes(m.event)) toast(text, "info");
        }
        if ((m.event === "order.updated" || m.event === "loyalty.earned") && role === "customer") api("/auth/me", { token }).then(r => setUser(r.user)).catch(() => {});
        if (m.event === "account.updated" && p.userId === user.id) api("/auth/me", { token }).then(r => setUser(r.user)).catch(() => {});
        if (m.event !== "rider.status" || role === "admin") softReload();
      } catch { /* ignore malformed event */ }
    };
    return () => es.close();
  }, [token, user?.id]); // eslint-disable-line

  /* ---------- actions ---------- */
  const run = useCallback(async (fn, msg) => {
    try { const r = await fn(); if (msg) toast(typeof msg === "function" ? msg(r) : msg); await load(true); return r === undefined ? true : r; }
    catch (e) { toast(e.message, "error"); return false; }
  }, [load, toast]);
  const call = (path, method, body) => api(path, { method, body, token });

  const actions = useMemo(() => ({
    placeOrder: (body) => run(() => call("/orders", "POST", body), "Order placed! We'll keep you posted."),
    cancelOrder: (id) => run(() => call(`/orders/${id}/cancel`, "PATCH"), "Order cancelled. Your stock was released."),
    updateStatus: (id, status) => run(() => call(`/orders/${id}/status`, "PATCH", { status }), `Order marked ${status}.`),
    assignRider: (id, riderId) => run(() => call(`/orders/${id}/assign-rider`, "PATCH", { riderId }), "Rider assigned and notified."),
    accept: (id) => run(() => call(`/orders/${id}/accept`, "PATCH"), "Delivery accepted. Drive safe!"),
    pickup: (id, pickupStatus) => run(() => call(`/orders/${id}/pickup`, "PATCH", { pickupStatus }), "Empty gallons recorded and returned to stock."),
    proof: (id, deliveredTo, note) => run(() => call(`/orders/${id}/proof`, "PATCH", { deliveredTo, note }), "Delivery proof saved."),
    feedback: (id, rating, feedback) => run(() => call(`/orders/${id}/feedback`, "PATCH", { rating, feedback }), (order) => order?.fulfillmentType === "Pick Up" ? "Thank you for rating your store experience!" : "Thank you for rating your delivery!"),
    collectPayment: (id) => run(() => call(`/orders/${id}/collect-payment`, "PATCH"), "Payment recorded."),
    setPayment: (id, status) => run(() => call(`/payments/${id}/status`, "PATCH", { status }), `Payment marked ${status}.`),
    archive: (id) => run(() => call(`/orders/${id}/archive`, "PATCH"), "Order archived."),
    restore: (id) => run(() => call(`/orders/${id}/restore`, "PATCH"), "Order restored."),
    saveProduct: (id, body) => run(() => id ? call(`/products/${id}`, "PUT", body) : call("/products", "POST", body), id ? "Product updated." : "Product added to the catalog."),
    // "Delete" in Inventory is a soft delete: the server moves the product to the Archive and keeps its data and image.
    deleteProduct: (id) => run(() => call(`/products/${id}`, "DELETE"), (r) => r?.message || "Product moved to the Archive."),
    restoreProduct: (id) => run(() => call(`/products/${id}/restore`, "PATCH"), (r) => r?.message || "Product restored to Inventory."),
    purgeProduct: (id) => run(() => call(`/products/${id}/permanent`, "DELETE"), (r) => r?.message || "Product permanently deleted."),
    // Archive Management: the server checks eligibility. Returns { ok, message } so the modal can show the reason inline.
    archiveRecord: async (type, id) => { try { const r = await call("/admin/archive", "POST", { type, id }); toast(r.message); await load(true); return { ok: true, message: r.message }; } catch (e) { return { ok: false, message: e.message }; } },
    adjustStock: (id, change, reason) => run(() => call(`/products/${id}/adjust`, "PATCH", { change, reason }), "Stock adjusted and logged."),
    createAccount: (body) => run(() => call("/admin/users", "POST", body), "Account created."),
    toggleUser: (u) => run(() => call(`/admin/users/${u._id}`, "PATCH", { active: !u.active }), u.active ? "Account deactivated. The 7-day appeal window has started." : "Account reactivated."),
    restoreUser: (id) => run(() => call(`/admin/users/${id}/restore`, "PATCH"), "Account restored."),
    deleteUser: (id) => run(() => call(`/admin/users/${id}`, "DELETE"), "Account permanently deleted."),
    resetPassword: (id, password) => run(() => call(`/admin/users/${id}/password`, "PATCH", { password }), "Password reset."),
    setMyStatus: async (status) => { try { const r = await call("/auth/rider-status", "PATCH", { status }); setUser(u => ({ ...u, ...r.user })); toast(status === "Ready" ? "You're online and ready for deliveries." : "You're now away."); } catch (e) { toast(e.message, "error"); } },
    saveProfile: async (body) => { try { const r = await call("/auth/profile", "PUT", body); setUser(u => ({ ...u, ...r.user })); toast("Profile saved."); return true; } catch (e) { toast(e.message, "error"); return false; } },
    changePassword: async (currentPassword, newPassword) => { try { await call("/auth/password", "PUT", { currentPassword, newPassword }); toast("Password updated."); return true; } catch (e) { toast(e.message, "error"); return false; } },
    reorder: (order) => {
      const items = {};
      for (const it of order.items || []) { const p = data.products.find(x => x._id === (it.product?._id || it.product) || x.name === it.name); if (p && p.stock > 0) items[p._id] = Math.min(p.stock, it.quantity); }
      if (!Object.keys(items).length) { toast("Those products aren't available right now.", "error"); return; }
      setDraft({ items, address: order.fulfillmentType === "Pick Up" ? "" : order.deliveryAddress }); go("order-now"); toast("Items added to your cart — review and place the order.", "info");
    }
  }), [run, token, data.products, go, toast]); // eslint-disable-line

  async function logout() {
    const ok = await confirm({ title: "Log out of AquaFlow?", body: "You'll need to sign in again to manage your orders.", confirmText: "Log out" });
    if (ok) signOut();
  }
  function onAuthed(result) { localStorage.setItem("af_token", result.token); setToken(result.token); setUser(result.user); go("dashboard"); toast(`Welcome${result.user.role === "customer" ? "" : " back"}, ${result.user.name.split(" ")[0]}!`); }

  /* ---------- gates ---------- */
  if (booting) return <div className="splash"><Bubbles /><Logo light /></div>;
  if (!user) return view === "landing"
    ? <Landing onAuth={(m) => { setAuthMode(m); setView("auth"); }} />
    : <Auth mode={authMode} setMode={setAuthMode} onBack={() => setView("landing")} onAuthed={onAuthed} />;

  const sections = NAV[role] || NAV.customer;
  const flat = sections.flatMap(([, items]) => items);
  const current = flat.find(([k]) => k === page) ? page : "dashboard";
  const currentLabel = flat.find(([k]) => k === current)?.[1] || "Dashboard";
  const badge = { orders: data.orders.filter(o => o.status === "Pending").length, delivery: role === "rider" ? data.orders.filter(o => !o.riderAcceptedAt && !["Completed", "Cancelled", "Delivered"].includes(o.status)).length : 0 };
  const unread = notes.filter(n => !n.read).length;
  const ctx = { user, token, role, data, loading, actions, go, page: current, reload: () => load(), draft, clearDraft: () => setDraft(null), setUser, live };

  const Page = {
    dashboard: Dashboard, orders: OrdersPage, delivery: DeliveryPage, inventory: InventoryPage, payments: PaymentsPage, reports: ReportsPage,
    audit: AuditPage, accounts: AccountsPage, riders: RidersPage, archive: ArchivePage, "order-now": OrderNow, "my-orders": MyOrders, loyalty: LoyaltyPage, profile: Profile
  }[current] || Dashboard;

  return <AppCtx.Provider value={ctx}>
    <div className="app">
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="side-top"><Logo light /><button className="icon-btn side-close" aria-label="Close menu" onClick={() => setNavOpen(false)}><X size={18} /></button></div>
        <nav>{sections.map(([title, items]) => <div key={title} className="nav-group"><span>{title}</span>{items.map(([k, label, Icon]) =>
          <button key={k} className={`nav-item ${current === k ? "active" : ""}`} onClick={() => go(k)}><Icon size={18} /><em>{label}</em>{badge[k] > 0 && <b>{badge[k]}</b>}</button>)}</div>)}</nav>
        <div className="side-foot">
          <div className="side-user"><Avatar name={user.name} size={36} /><div><b>{user.name}</b><small>{role}</small></div></div>
          <button className="nav-item" onClick={logout}><LogOut size={18} /><em>Log out</em></button>
        </div>
        <svg className="side-wave" viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 30c40-20 80 20 120 0s80-20 120 0 40 10 60 0v30H0z" /></svg>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}><Menu size={20} /></button>
          <div className="top-title"><b>{currentLabel}</b><small className={live ? "live" : ""}><i />{live ? "Live" : "Reconnecting…"}</small></div>
          <div className="top-right">
            <div className="notes-wrap">
              <button className="icon-btn" aria-label="Notifications" aria-expanded={notesOpen} onClick={() => { setNotesOpen(o => !o); }}><Bell size={19} />{unread > 0 && <span className="dot">{unread > 9 ? "9+" : unread}</span>}</button>
              {notesOpen && <><div className="pop-scrim" onClick={() => setNotesOpen(false)} /><div className="popover notes-pop">
                <header><b>Notifications</b><div><button className="link" onClick={() => setNotes(n => n.map(x => ({ ...x, read: true })))}><Check size={14} /> Mark read</button><button className="link" onClick={() => setNotes([])}>Clear</button></div></header>
                {notes.length ? <ul>{notes.map(n => <li key={n.id}><button className={n.read ? "read" : ""} onClick={() => { setNotes(p => p.map(x => x.id === n.id ? { ...x, read: true } : x)); go(n.target); }}><i /><span>{n.text}<small>{ago(n.at)}</small></span></button></li>)}</ul>
                  : <p className="pop-empty">You're all caught up. Order and delivery updates show up here instantly.</p>}</div></>}
            </div>
            <button className="user-pill" onClick={() => go("profile")}><Avatar name={user.name} size={34} /><span><b>{user.name.split(" ")[0]}</b><small>{role}</small></span></button>
          </div>
        </header>
        <main className="content" key={current}><Page /></main>
        <footer className="foot"><span>© {new Date().getFullYear()} AquaFlow Water Refilling Station</span><span><ShieldCheck size={14} /> Clean water. Better service.</span></footer>
      </div>
    </div>
  </AppCtx.Provider>;
}

export default function App() { return <UIProvider><Shell /></UIProvider>; }
