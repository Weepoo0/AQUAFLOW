import { useEffect, useMemo, useState } from "react";
import { Droplets, MapPin, Store, Truck, Recycle, CalendarClock, CreditCard, ShoppingCart, Search, Receipt, RefreshCw, Phone, X, Star, Lock, ShieldCheck, Gift, Check, Eye, EyeOff, Package, TrendingUp } from "lucide-react";
import { useApp } from "../ctx";
import { api } from "../api";
import { useUI, PageHead, Card, Status, Empty, Tabs, Field, Stepper, Modal, Avatar, Stars, PasswordMeter, SearchBox, Pager } from "../ui";
import { Timeline, FeedbackForm, OrderDrawer } from "../components/OrderDetail";
import LocationPicker from "../components/LocationPicker";
import { money, fmtDate, fmtDateTime, TIME_SLOTS, PAY_METHODS, ACTIVE, printReceipt } from "../lib";
import { getProductImage, STORE_METADATA } from "../config";

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const itemType = item => item.productType || item.type || item.product?.type || (["Empty Gallon", "Mineral Water", "Purified Water"].includes(item.name) ? item.name : "");
const isEmptyGallonOrderItem = item => itemType(item) === "Empty Gallon";

export function OrderNow() {
  const { data, user, actions, go, draft, clearDraft } = useApp(); const { toast } = useUI();
  const [cart, setCart] = useState({}); const [type, setType] = useState("All");
  const [method, setMethod] = useState("Delivery"); const [addrMode, setAddrMode] = useState(user.address ? "main" : "custom");
  const [custom, setCustom] = useState(""); const [pin, setPin] = useState(null);
  const [date, setDate] = useState(today()); const [slot, setSlot] = useState(TIME_SLOTS[0]); const [empties, setEmpties] = useState(0); const [pay, setPay] = useState("Cash on Delivery");
  const [review, setReview] = useState(false); const [containerMismatch, setContainerMismatch] = useState(false); const [busy, setBusy] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  useEffect(() => { if (draft) { setCart(draft.items); if (draft.address) { setAddrMode("custom"); setCustom(draft.address); } clearDraft(); } }, []); // eslint-disable-line

  const types = ["All", ...new Set(data.products.map(p => p.type))];
  const shown = data.products.filter(p => type === "All" || p.type === type);
  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => ({ p: data.products.find(x => x._id === id), q })).filter(l => l.p);
  const total = lines.reduce((s, l) => s + l.p.price * l.q, 0); const count = lines.reduce((s, l) => s + l.q, 0);
  const totalWater = lines.filter(({ p }) => ["Mineral Water", "Purified Water"].includes(p.type)).reduce((sum, { q }) => sum + q, 0);
  const newEmptyGallons = lines.filter(({ p }) => p.type === "Empty Gallon").reduce((sum, { q }) => sum + q, 0);
  const totalContainers = empties + newEmptyGallons;
  const missingContainers = Math.max(0, totalWater - totalContainers);
  const extraContainers = Math.max(0, totalContainers - totalWater);
  const emptyGallonProduct = data.products.find(p => p.type === "Empty Gallon" && p.active !== false);
  const selectedEmptyGallons = emptyGallonProduct ? cart[emptyGallonProduct._id] || 0 : 0;
  const canBuyMissing = Boolean(emptyGallonProduct && missingContainers > 0 && selectedEmptyGallons + missingContainers <= emptyGallonProduct.stock);
  const addr = method === "Pick Up" ? STORE_METADATA.address : addrMode === "main" ? user.address : addrMode === "optional" ? user.optionalAddress : custom;
  const coords = method === "Pick Up" ? null : addrMode === "main" ? (user.addressLatitude != null ? { lat: user.addressLatitude, lng: user.addressLongitude } : null) : addrMode === "optional" ? (user.optionalAddressLatitude != null ? { lat: user.optionalAddressLatitude, lng: user.optionalAddressLongitude } : null) : pin;
  const setQty = (id, q) => setCart(c => ({ ...c, [id]: q }));
  const points = Math.floor(total / 100);

  function proceed() {
    setContainerMismatch(false);
    if (!lines.length) return toast("Add at least one product to your cart.", "error");
    if (method === "Delivery" && !addr?.trim()) return toast("Enter or choose a delivery address.", "error");
    if (totalWater > 0 && totalWater !== totalContainers) {
      setContainerMismatch(true);
      return;
    }
    setReview(true);
  }
  function buyMissingContainers() {
    if (!canBuyMissing) return;
    setCart(current => ({ ...current, [emptyGallonProduct._id]: (current[emptyGallonProduct._id] || 0) + missingContainers }));
    setContainerMismatch(false);
    setReview(true);
  }
  async function place() {
    if (totalWater > 0 && totalWater !== totalContainers) {
      setReview(false);
      setContainerMismatch(true);
      return;
    }
    setBusy(true);
    try {
      let address;
      if (method === "Delivery") {
        const lookupUrl = coords
          ? `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.lat}&lon=${coords.lng}`
          : `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=ph&q=${encodeURIComponent(addr)}`;
        const response = await fetch(lookupUrl);
        if (!response.ok) throw new Error("Couldn't verify the delivery area. Please try again.");
        const result = await response.json();
        const location = Array.isArray(result) ? result[0] : result;
        const city = location?.address?.city || location?.address?.town || location?.address?.municipality;
        if (!city) throw new Error("Couldn't determine the delivery city from this address. Please pin the map or add the city name.");
        address = { city };
      }
      const ok = await actions.placeOrder({ items: lines.map(l => ({ product: l.p._id, quantity: l.q })), deliveryAddress: addr, address, fulfillmentType: method, deliveryLatitude: coords?.lat, deliveryLongitude: coords?.lng, deliveryDate: date || undefined, preferredTime: slot, paymentMethod: pay, emptyGallonsToPickup: empties });
      if (ok) { setReview(false); setCart({}); setEmpties(0); go("my-orders"); }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't verify the delivery area. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return <div className="stack">
    <PageHead eyebrow="Customer portal" title="Order water" text="Pick your products, choose how you'd like to receive them, and we'll take it from there." />
    <div className="order-layout">
      <div className="stack">
        <div className="chips">{types.map(t => <button key={t} className={type === t ? "active" : ""} onClick={() => setType(t)}>{t}</button>)}</div>
        <div className="products">{shown.map(p => { const q = cart[p._id] || 0; const low = p.stock <= p.lowStockThreshold; const image = getProductImage(p);
          return <article key={p._id} className={`product ${q ? "in-cart" : ""} ${p.stock < 1 ? "sold" : ""}`}>
            <div className="product-art">{image ? <button type="button" className="product-image-trigger" aria-label={`View full image of ${p.name}`} onClick={() => setImagePreview({ src: image, name: p.name })}><img className="product-photo" src={image} alt={p.name} loading="lazy" /></button> : <Droplets size={44} strokeWidth={1.4} />}<span className={low ? "low" : ""}>{p.stock < 1 ? "Sold out" : low ? `Only ${p.stock} left` : `${p.stock} in stock`}</span></div>
            <div className="product-info"><small>{p.type}</small><h3>{p.name}</h3><div className="product-foot"><b>{money(p.price)}<em> / {p.unit}</em></b>
              {q > 0 ? <Stepper value={q} max={p.stock} onChange={v => setQty(p._id, v)} /> : <button className="btn btn-primary btn-sm" disabled={p.stock < 1} onClick={() => setQty(p._id, 1)}>Add</button>}</div></div></article>; })}
          {!shown.length && <Empty icon={Package} title="No products available" text="Please check back soon." />}</div>

        <Card title="How would you like to receive it?">
          <div className="seg seg-wide"><button className={method === "Delivery" ? "active" : ""} onClick={() => setMethod("Delivery")}><Truck size={16} /> Delivery</button><button className={method === "Pick Up" ? "active" : ""} onClick={() => setMethod("Pick Up")}><Store size={16} /> Pick up at station</button></div>
          {method === "Delivery" ? <div className="form-grid">
            <div className="full"><span className="lbl">Delivery address</span>
              <div className="addr-opts">{user.address && <button type="button" className={addrMode === "main" ? "active" : ""} onClick={() => setAddrMode("main")}><Lock size={13} /> Main address<small>{user.address}</small></button>}
                {user.optionalAddress && <button type="button" className={addrMode === "optional" ? "active" : ""} onClick={() => setAddrMode("optional")}><MapPin size={13} /> Other address<small>{user.optionalAddress}</small></button>}
                <button type="button" className={addrMode === "custom" ? "active" : ""} onClick={() => setAddrMode("custom")}><MapPin size={13} /> Somewhere else<small>Type it and drop a pin</small></button></div></div>
            {addrMode === "custom" && <><div className="full"><Field label="Address details"><textarea rows={2} value={custom} onChange={e => setCustom(e.target.value)} placeholder="House number, street, barangay, city" /></Field></div>
              <div className="full"><LocationPicker value={pin} onChange={setPin} onAddress={setCustom} /></div></>}
            {addrMode !== "custom" && coords && <div className="full"><LocationPicker value={coords} readOnly height={170} /></div>}
            <Field label="Delivery date"><input type="date" min={today()} value={date} onChange={e => setDate(e.target.value)} /></Field>
            <div><span className="lbl">Time window</span><div className="chips tight">{TIME_SLOTS.map(t => <button type="button" key={t} className={slot === t ? "active" : ""} onClick={() => setSlot(t)}>{t}</button>)}</div></div>
            <div className="full empties"><span><Recycle size={18} /></span><div><b>Return empty gallons</b><small>Your rider collects them at the door.</small></div><Stepper value={empties} max={20} onChange={setEmpties} /></div>
          </div> : <div className="form-grid">
            <div className="full"><Field label="Store address"><input value={STORE_METADATA.address} readOnly /></Field></div>
            <div className="full locpicker">
              <iframe
                className="loc-map"
                title={`${STORE_METADATA.name} location`}
                src={`https://www.google.com/maps?q=${STORE_METADATA.coordinates.lat},${STORE_METADATA.coordinates.lng}&z=17&output=embed`}
                style={{ height: 260, display: "block", width: "100%", border: 0 }}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
              <div className="loc-foot">
                <span>📍 {STORE_METADATA.coordinates.lat}, {STORE_METADATA.coordinates.lng}</span>
                <a
                  className="btn btn-outline btn-sm"
                  href={STORE_METADATA.mapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open map ↗
                </a>
              </div>
            </div>
            <div className="full empties">
              <span><Recycle size={18} /></span>
              <div>
                <b>Bring empty gallons for exchange</b>
                <small>Please bring your empty containers directly to our store counter to swap for your full items.</small>
              </div>
              <Stepper value={empties} max={20} onChange={setEmpties} />
            </div>
            <Field label="Pick-up date"><input type="date" min={today()} value={date} onChange={e => setDate(e.target.value)} /></Field>
            <div><span className="lbl">Time window</span><div className="chips tight">{TIME_SLOTS.map(t => <button type="button" key={t} className={slot === t ? "active" : ""} onClick={() => setSlot(t)}>{t}</button>)}</div></div></div>}
        </Card>

        <Card title="Payment method" text="Your choice is recorded with the order. Staff confirm payment when it's received.">
          <div className="pay-opts">{PAY_METHODS.map(([k, d]) => <button type="button" key={k} className={pay === k ? "active" : ""} onClick={() => setPay(k)}><CreditCard size={18} /><span><b>{k}</b><small>{d}</small></span>{pay === k && <Check size={16} />}</button>)}</div>
        </Card>
      </div>

      <aside className="cart"><Card title="Your order" text={count ? `${count} item${count > 1 ? "s" : ""}` : "Your cart is empty"}>
        {lines.length ? <ul className="cart-lines">{lines.map(({ p, q }) => <li key={p._id}><span><b>{p.name}</b><small>{money(p.price)} × {q}</small></span><b>{money(p.price * q)}</b><button aria-label={`Remove ${p.name}`} onClick={() => setQty(p._id, 0)}><X size={14} /></button></li>)}</ul> : <p className="muted cart-empty"><ShoppingCart size={20} /> Add products to get started.</p>}
        <dl className="sum"><div><dt>Method</dt><dd>{method}</dd></div>{empties > 0 && <div><dt>{method === "Pick Up" ? "Empties to bring" : "Empties to return"}</dt><dd>{empties}</dd></div>}<div><dt>Payment</dt><dd>{pay}</dd></div>{points > 0 && <div><dt>You'll earn</dt><dd className="ok-text"><Gift size={13} /> {points} point{points > 1 ? "s" : ""}</dd></div>}<div className="grand"><dt>Total</dt><dd>{money(total)}</dd></div></dl>
        <button className="btn btn-primary btn-block btn-lg" disabled={!lines.length} onClick={proceed}>Review order</button>
      </Card></aside>
    </div>

    {containerMismatch && <Modal title="Container mismatch" onClose={() => setContainerMismatch(false)} footer={<div className="container-modal-actions">
      <button className="btn btn-ghost" onClick={() => setContainerMismatch(false)}>Back to cart</button>
      {missingContainers > 0 && <button className="btn btn-primary" disabled={!canBuyMissing} onClick={buyMissingContainers}>
        <span>Buy {missingContainers} New Empty Gallon{missingContainers === 1 ? "" : "s"} &amp; Proceed</span>
        <small>{money(emptyGallonProduct?.price || 150)} each · New order total: {money(total + (emptyGallonProduct?.price || 150) * missingContainers)}</small>
      </button>}
    </div>}>
      <p className="alert alert-error" role="alert">Container Mismatch: You are ordering {totalWater} jugs of water but only have {totalContainers} container(s) accounted for. {missingContainers > 0 ? `You are short of ${missingContainers} container(s).` : `You have ${extraContainers} extra container(s); reduce the return count or remove new empty gallons to match.`}</p>
      {missingContainers > 0 && !emptyGallonProduct && <p className="field-error">New Empty Gallon is currently unavailable.</p>}
      {missingContainers > 0 && emptyGallonProduct && !canBuyMissing && <p className="field-error">Only {Math.max(0, emptyGallonProduct.stock - selectedEmptyGallons)} additional new empty gallon(s) are in stock.</p>}
    </Modal>}
    {review && <Modal title="Confirm your order" subtitle="Please double-check the details." onClose={() => !busy && setReview(false)} footer={<><button className="btn btn-ghost" disabled={busy} onClick={() => setReview(false)}>Edit</button><button className="btn btn-primary" disabled={busy} onClick={place}>{busy ? "Placing…" : `Place order · ${money(total)}`}</button></>}>
      <ul className="cart-lines flat">{lines.map(({ p, q }) => <li key={p._id}><span><b>{p.name}</b><small>× {q}</small></span><b>{money(p.price * q)}</b></li>)}</ul>
      <div className="confirm-grid"><div><small>{method === "Delivery" ? "Deliver to" : "Pick up at"}</small><b>{addr}</b></div><div><small>When</small><b>{date ? fmtDate(date) : "ASAP"} · {slot}</b></div><div><small>Payment</small><b>{pay}</b></div>{empties > 0 && <div><small>{method === "Pick Up" ? "Empty gallons to bring to the counter" : "Empty gallons to collect"}</small><b>{empties}</b></div>}</div>
    </Modal>}
    {imagePreview && <Modal title={imagePreview.name} onClose={() => setImagePreview(null)} wide footer={<button className="btn btn-primary" onClick={() => setImagePreview(null)}>Close</button>}>
      <img className="image-preview" src={imagePreview.src} alt={imagePreview.name} />
    </Modal>}
  </div>;
}

export function MyOrders() {
  const { data, actions, go } = useApp(); const { confirm } = useUI();
  const [tab, setTab] = useState("active"); const [q, setQ] = useState(""); const [open, setOpen] = useState(null);
  const groups = { active: data.orders.filter(o => ACTIVE.includes(o.status)), done: data.orders.filter(o => ["Delivered", "Completed"].includes(o.status)), cancelled: data.orders.filter(o => o.status === "Cancelled"), all: data.orders };
  const rows = groups[tab].filter(o => `${o.orderNumber} ${o.items.map(i => i.name).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  async function cancel(o) { if (await confirm({ title: `Cancel ${o.orderNumber}?`, body: "This order will be cancelled and your reserved items released.", confirmText: "Cancel order", cancelText: "Keep order", danger: true })) actions.cancelOrder(o._id); }
  return <div className="stack">
    <PageHead eyebrow="Customer portal" title="My orders" text="Follow each order live, rate your deliveries and reorder in one tap."><SearchBox q={q} setQ={setQ} placeholder="Search orders…" /></PageHead>
    <Tabs value={tab} onChange={setTab} items={[["active", "Active", groups.active.length], ["done", "Delivered", groups.done.length], ["cancelled", "Cancelled", groups.cancelled.length], ["all", "All", groups.all.length]]} />
    {rows.length ? <div className="stack">{rows.map(o => {
      const done = ["Delivered", "Completed"].includes(o.status);
      const canCancel = ["Pending", "Confirmed"].includes(o.status) && !o.riderAcceptedAt;
      const purchasedEmptyGallon = o.items.some(isEmptyGallonOrderItem);
      const returnCount = Number(o.emptyGallonsToPickup) || 0;
      const newEmptyCount = Number(o.newEmptyGallonsPurchased) || o.items.filter(isEmptyGallonOrderItem).reduce((sum, item) => sum + item.quantity, 0);
      const totalWater = o.items.filter(i => ["Mineral Water", "Purified Water"].includes(itemType(i))).reduce((sum, item) => sum + item.quantity, 0);
      const invalidSwap = totalWater > 0 && totalWater !== returnCount + newEmptyCount;
      const trackedItems = o.items.filter(i => !isEmptyGallonOrderItem(i)).map(i => `${i.name} × ${i.quantity}`);
      if (returnCount > 0 && !invalidSwap) trackedItems.push(o.fulfillmentType === "Pick Up" ? `Bring ${returnCount} Empties to Store Counter (${o.pickupStatus})` : `Swap ${returnCount} Empties (${o.pickupStatus})`);
      if (purchasedEmptyGallon && !invalidSwap) trackedItems.push(`${newEmptyCount} New Container${newEmptyCount === 1 ? "" : "s"} Included`);
      return <article key={o._id} className="card track">
        <header><div><small>{o.fulfillmentType} · {fmtDateTime(o.createdAt)}</small><h3>{o.orderNumber}</h3></div><div className="track-head-r"><Status status={o.status} /><b>{money(o.total)}</b></div></header>
        <Timeline order={o} />
        <div className="track-info">
          <div><MapPin size={15} /><span><small>{o.fulfillmentType === "Pick Up" ? "Pick up at" : "Deliver to"}</small>{o.deliveryAddress}</span></div>
          <div><CalendarClock size={15} /><span><small>Schedule</small>{o.deliveryDate ? fmtDate(o.deliveryDate) : "ASAP"} · {o.preferredTime}</span></div>
          {o.fulfillmentType !== "Pick Up" && <div><Truck size={15} /><span><small>Rider</small>{o.rider?.name || "Assigning a rider…"}{o.rider?.phone && <a href={`tel:${o.rider.phone}`}> · <Phone size={11} /> {o.rider.phone}</a>}</span></div>}
          <div><CreditCard size={15} /><span><small>Payment</small>{o.paymentMethod} · {o.paymentStatus}</span></div>
        </div>
        {o.status === "Arrived" && <div className="banner-ok"><Truck size={18} /> Your rider has arrived. Please get ready to receive your water!</div>}
        {invalidSwap
          ? <p className="alert alert-error" role="alert">Container count mismatch: this order’s water and containers do not balance 1:1.</p>
          : <p className="track-items">{trackedItems.join(" · ") || "New Containers Included"}</p>}
        {done && <section className="rate">{o.customerRating ? <div className="fb-shown"><div><b>Thanks for your feedback!</b><small>{o.fulfillmentType === "Pick Up" ? "You rated our store experience" : `You rated ${o.rider?.name || "your rider"}`}</small></div><Stars value={o.customerRating} size={20} />{o.customerFeedback && <blockquote>“{o.customerFeedback}”</blockquote>}</div>
          : <><div className="rate-head"><Star size={18} /><div><b>{o.fulfillmentType === "Pick Up" ? "How was your store experience?" : "How was your delivery?"}</b><small>{o.fulfillmentType === "Pick Up" ? "Rate our service and product – it helps us improve." : `Rate ${o.rider?.name || "your rider"} – it helps us improve.`}</small></div></div><FeedbackForm order={o} /></>}</section>}
        <footer><button className="btn btn-ghost btn-sm" onClick={() => setOpen(o._id)}>View details</button><button className="btn btn-ghost btn-sm" onClick={() => printReceipt(o) || alert("Please allow pop-ups to print the receipt.")}><Receipt size={15} /> Receipt</button>
          <button className="btn btn-outline btn-sm" disabled={o.status === "Cancelled"} onClick={() => actions.reorder(o)}><RefreshCw size={15} /> Reorder</button>{canCancel && <button className="btn btn-danger-ghost btn-sm" onClick={() => cancel(o)}>Cancel order</button>}</footer>
      </article>; })}</div>
    : <Card><Empty icon={ShoppingCart} title={tab === "active" ? "No active orders" : "Nothing here yet"} text="Orders you place will appear here with live tracking." action={<button className="btn btn-primary" onClick={() => go("order-now")}>Order water</button>} /></Card>}
    {open && <OrderDrawer id={open} onClose={() => setOpen(null)} />}
  </div>;
}

const POINT_LABEL = { earned: "Earned", redeemed: "Redeemed", adjusted: "Adjustment" };
export function LoyaltyPage() {
  const { token, user, go } = useApp();
  const [page, setPage] = useState(1); const [info, setInfo] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const SIZE = 10;
  // Reloads when the balance changes, so a new award shows up here as soon as the live update arrives.
  useEffect(() => {
    let current = true;
    setLoading(true);
    api(`/loyalty/me?page=${page}&limit=${SIZE}`, { token })
      .then(r => { if (current) { setInfo(r); setError(""); } })
      .catch(e => { if (current) setError(e.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, page, user.loyaltyPoints]);
  const rows = info?.transactions || [];
  const per = info?.pesosPerPoint || 100;
  return <div className="stack">
    <PageHead eyebrow="Customer portal" title="Loyalty points" text={`You earn 1 point for every ₱${per} once an order is completed and paid.`} />
    <div className="kpis kpis-3">
      <article className="kpi tone-violet"><span className="kpi-icon"><Gift size={20} /></span><small>Current balance</small><b>{info?.balance ?? user.loyaltyPoints ?? 0}</b><em>Points you have now</em></article>
      <article className="kpi tone-green"><span className="kpi-icon"><TrendingUp size={20} /></span><small>Total earned</small><b>{info?.earned ?? 0}</b><em>From completed orders</em></article>
      <article className="kpi tone-amber"><span className="kpi-icon"><Receipt size={20} /></span><small>Total redeemed</small><b>{info?.redeemed ?? 0}</b><em>Points already used</em></article>
    </div>
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    <Card title="Points history" text="Newest first" pad={false}>
      {rows.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Activity</th><th className="right">Points</th><th className="right">Balance</th></tr></thead><tbody>
        {rows.map(t => <tr key={t._id}>
          <td className="nowrap">{fmtDateTime(t.createdAt)}</td>
          <td><b>{t.description || POINT_LABEL[t.type]}</b><small className="sub">{POINT_LABEL[t.type]}{t.orderTotal != null ? ` · ${money(t.orderTotal)} order` : ""}</small></td>
          <td className="right"><b className={t.points > 0 ? "ok-text" : "warn-text"}>{t.points > 0 ? "+" : "−"}{Math.abs(t.points)}</b></td>
          <td className="right">{t.balanceAfter ?? "—"}</td></tr>)}</tbody></table></div>
        : !loading && !error && <Empty icon={Gift} title="No points yet" text={`Complete an order of ₱${per} or more and your points show up here.`} action={<button className="btn btn-primary" onClick={() => go("order-now")}>Order water</button>} />}
      <Pager page={info?.page || 1} pages={info?.totalPages || 1} onPage={setPage} total={info?.total || 0} size={SIZE} />
    </Card>
  </div>;
}

export function Profile() {
  const { user, role, actions, data } = useApp(); const [tab, setTab] = useState("account");
  const [acc, setAcc] = useState({ name: user.name || "", phone: user.phone || "" });
  const [ad, setAd] = useState({ main: user.address || "", mainOk: Boolean(user.addressConfirmed), mainPin: user.addressLatitude != null ? { lat: user.addressLatitude, lng: user.addressLongitude } : null, alt: user.optionalAddress || "", altOk: Boolean(user.optionalAddressConfirmed), altPin: user.optionalAddressLatitude != null ? { lat: user.optionalAddressLatitude, lng: user.optionalAddressLongitude } : null });
  const [pw, setPw] = useState({ cur: "", next: "", again: "" }); const [show, setShow] = useState(false); const [busy, setBusy] = useState(false);
  const { toast } = useUI(); const locked = Boolean(user.addressConfirmed);
  useEffect(() => { setAd(a => ({ ...a, main: user.address || a.main, mainOk: Boolean(user.addressConfirmed) })); }, [user.addressConfirmed, user.address]);

  async function saveAccount(e) { e.preventDefault(); setBusy(true); await actions.saveProfile({ name: acc.name, phone: acc.phone }); setBusy(false); }
  async function saveAddr(e) {
    e.preventDefault();
    if (ad.main.trim() && !ad.mainOk) return toast("Please confirm your main address before saving.", "error");
    if (ad.alt.trim() && !ad.altOk) return toast("Please confirm your other address before saving.", "error");
    setBusy(true);
    await actions.saveProfile({ name: user.name, phone: user.phone, ...(ad.main.trim() ? { address: ad.main, addressConfirmed: true, addressLatitude: ad.mainPin?.lat, addressLongitude: ad.mainPin?.lng } : {}), optionalAddress: ad.alt, optionalAddressConfirmed: ad.altOk, optionalAddressLatitude: ad.altPin?.lat ?? null, optionalAddressLongitude: ad.altPin?.lng ?? null });
    setBusy(false);
  }
  async function savePw(e) {
    e.preventDefault();
    if (pw.next !== pw.again) return toast("The new passwords don't match.", "error");
    setBusy(true); const ok = await actions.changePassword(pw.cur, pw.next); setBusy(false); if (ok) setPw({ cur: "", next: "", again: "" });
  }
  const tabs = [["account", "Account"], ...(role === "customer" ? [["addresses", "Addresses"]] : []), ["security", "Security"]];
  const mine = data.orders; const ratings = role === "rider" ? mine.filter(o => o.customerRating) : [];
  return <div className="stack">
    <PageHead eyebrow="Account" title="My profile" text="Manage your details, addresses and password." />
    <div className="profile-layout">
      <Card className="profile-card"><Avatar name={user.name} size={72} /><h3>{user.name}</h3><small>{user.email}</small><span className="chip chip-lg">{role}</span>
        {role === "customer" && <div className="points"><Gift size={18} /><div><b>{user.loyaltyPoints || 0}</b><small>loyalty points</small></div></div>}
        {role === "rider" && <div className="points"><Star size={18} /><div><b>{ratings.length ? (ratings.reduce((s, o) => s + o.customerRating, 0) / ratings.length).toFixed(1) : "—"}</b><small>average rating</small></div></div>}
      </Card>
      <div className="stack">
        <Tabs value={tab} onChange={setTab} items={tabs} />
        {tab === "account" && <Card title="Account details"><form className="form-grid" onSubmit={saveAccount}>
          <Field label="Full name"><input value={acc.name} onChange={e => setAcc({ ...acc, name: e.target.value })} required /></Field>
          <Field label="Mobile number"><input value={acc.phone} onChange={e => setAcc({ ...acc, phone: e.target.value })} placeholder="09XX XXX XXXX" inputMode="tel" /></Field>
          <div className="full"><Field label="Email address" hint="Your email is your sign-in and can't be changed here."><input value={user.email} disabled /></Field></div>
          <div className="full"><button className="btn btn-primary" disabled={busy}>Save changes</button></div></form></Card>}
        {tab === "addresses" && <form className="stack" onSubmit={saveAddr}>
          <Card title="Main address" text={locked ? "Confirmed and locked. Use your optional address for another delivery location." : "Confirm it once — then it cannot be changed, so deliveries always go to the right place."}>
            <div className="form-grid"><div className="full"><Field label="Address" hint={locked ? "This confirmed main address cannot be edited." : undefined}><textarea rows={2} value={ad.main} disabled={locked} onChange={e => setAd({ ...ad, main: e.target.value, mainOk: false })} placeholder="House number, street, barangay, city" /></Field></div>
              <div className="full"><LocationPicker value={ad.mainPin} readOnly={locked} onChange={p => setAd(a => ({ ...a, mainPin: p }))} onAddress={a => !locked && setAd(x => ({ ...x, main: a, mainOk: false }))} height={220} /></div>
              {!locked && ad.main.trim() && <label className="check full"><input type="checkbox" checked={ad.mainOk} onChange={e => setAd({ ...ad, mainOk: e.target.checked })} /><span>I confirm this main address is correct.</span></label>}</div></Card>
          <Card title="Other address" text="Optional — e.g. your office or a relative's home. Editable anytime.">
            <div className="form-grid"><div className="full"><Field label="Address"><textarea rows={2} value={ad.alt} onChange={e => setAd({ ...ad, alt: e.target.value, altOk: false })} placeholder="Alternative delivery address" /></Field></div>
              <div className="full"><LocationPicker value={ad.altPin} onChange={p => setAd(a => ({ ...a, altPin: p }))} onAddress={a => setAd(x => ({ ...x, alt: a, altOk: false }))} height={200} /></div>
              {ad.alt.trim() && <label className="check full"><input type="checkbox" checked={ad.altOk} onChange={e => setAd({ ...ad, altOk: e.target.checked })} /><span>I confirm this address is correct.</span></label>}</div></Card>
          <div><button className="btn btn-primary" disabled={busy}>Save addresses</button></div></form>}
        {tab === "security" && <Card title="Change password" text="Use at least 12 characters, with a number and a symbol."><form className="form-grid" onSubmit={savePw}>
          <div className="full"><Field label="Current password"><input type={show ? "text" : "password"} value={pw.cur} onChange={e => setPw({ ...pw, cur: e.target.value })} autoComplete="current-password" required /></Field></div>
          <div className="full"><Field label="New password"><input type={show ? "text" : "password"} value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" required minLength={12} /></Field><PasswordMeter value={pw.next} /></div>
          <div className="full"><Field label="Confirm new password"><input type={show ? "text" : "password"} value={pw.again} onChange={e => setPw({ ...pw, again: e.target.value })} autoComplete="new-password" required /></Field></div>
          <div className="full row-actions"><button className="btn btn-primary" disabled={busy}>Update password</button><button type="button" className="btn btn-ghost" onClick={() => setShow(s => !s)}>{show ? <EyeOff size={16} /> : <Eye size={16} />} {show ? "Hide" : "Show"} passwords</button></div></form></Card>}
      </div>
    </div>
  </div>;
}
