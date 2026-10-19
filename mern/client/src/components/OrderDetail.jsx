import { useState } from "react";
import { Phone, MapPin, Truck, Recycle, CalendarClock, CreditCard, Receipt, RefreshCw, Archive, X, Check, Navigation, PackageCheck, Star, Wallet, FileSignature, Store, UserRound } from "lucide-react";
import { useApp } from "../ctx";
import { useUI, Drawer, Status, Stars, Field } from "../ui";
import { money, fmtDate, fmtDateTime, nextStep, stepsFor, STEP_LABEL, isFinal, printReceipt } from "../lib";
import LocationPicker from "./LocationPicker";

export function Timeline({ order }) {
  if (order.status === "Cancelled") return <div className="tl-cancel"><X size={18} /><div><b>Order cancelled</b><small>Reserved stock was returned to inventory.</small></div></div>;
  const steps = stepsFor(order); const idx = steps.indexOf(order.status);
  return <ol className="timeline">{steps.map((s, i) => <li key={s} className={i < idx || order.status === "Completed" ? "done" : i === idx ? "now" : ""}><span>{i < idx || order.status === "Completed" ? <Check size={13} strokeWidth={3} /> : i + 1}</span><em>{STEP_LABEL[s]}</em></li>)}</ol>;
}

export function FeedbackForm({ order }) {
  const { actions } = useApp(); const [rating, setRating] = useState(0); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const isPickup = order.fulfillmentType === "Pick Up";
  const experience = isPickup ? "experience" : "delivery";
  async function submit(e) { e.preventDefault(); if (!rating) return setErr(`Tap a star to rate your ${experience}.`); setBusy(true); const ok = await actions.feedback(order._id, rating, text); setBusy(false); if (!ok) setErr("We couldn't save your rating. Please try again."); }
  return <form className="feedback-form" onSubmit={submit}>
    <div className="fb-stars"><Stars value={rating} size={30} onChange={(n) => { setRating(n); setErr(""); }} /><span>{rating ? ["", "Poor", "Fair", "Good", "Very good", "Excellent"][rating] : "Tap a star"}</span></div>
    <textarea rows={3} maxLength={1000} value={text} onChange={e => setText(e.target.value)} placeholder={isPickup ? "Tell us about your experience (optional)" : `Tell us about your delivery${order.rider?.name ? ` with ${order.rider.name}` : ""} (optional)`} />
    <div className="fb-foot"><small>{text.length}/1000</small><button className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : <><Star size={15} /> Submit rating</>}</button></div>
    {err && <p className="field-error">{err}</p>}</form>;
}

function ProofForm({ order }) {
  const { actions } = useApp(); const [name, setName] = useState(order.deliveredTo || order.customer?.name || ""); const [note, setNote] = useState(order.deliveryProofNote || "");
  return <form className="proof-form" onSubmit={e => { e.preventDefault(); actions.proof(order._id, name, note); }}>
    <Field label="Received by"><input value={name} maxLength={120} onChange={e => setName(e.target.value)} placeholder="Recipient name" /></Field>
    <Field label="Delivery note"><input value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="e.g. Left with the guard at the front gate" /></Field>
    <button className="btn btn-outline"><FileSignature size={16} /> {order.deliveredAt && order.deliveredTo ? "Update proof" : "Save delivery proof"}</button></form>;
}

export function OrderActions({ order, compact = false }) {
  const { role, actions } = useApp(); const { confirm } = useUI();
  const next = nextStep(order, role); const o = order;
  const canPay = ["admin", "rider"].includes(role) && o.paymentStatus !== "Paid" && o.status !== "Cancelled" && (role === "admin" || ["Arrived", "Delivered"].includes(o.status));
  const canPickup = ["admin", "rider"].includes(role) && o.emptyGallonsToPickup > 0 && o.pickupStatus !== "Collected" && ["Arrived", "Delivered", "Completed"].includes(o.status) && (role === "admin" || o.riderAcceptedAt);
  const canCancel = role === "admin" && !["Delivered", "Completed", "Cancelled"].includes(o.status);
  async function cancel() { if (await confirm({ title: `Cancel ${o.orderNumber}?`, body: "The reserved stock will be returned to inventory and the customer will be notified.", confirmText: "Cancel order", cancelText: "Keep order", danger: true })) actions.updateStatus(o._id, "Cancelled"); }
  return <div className={`actions ${compact ? "compact" : ""}`}>
    {role === "rider" && !o.riderAcceptedAt && !isFinal(o.status) && <button className="btn btn-primary btn-sm" onClick={() => actions.accept(o._id)}><Check size={15} /> Accept delivery</button>}
    {next && <button className="btn btn-primary btn-sm" onClick={() => actions.updateStatus(o._id, next.status)}>{next.label}</button>}
    {canPay && <button className="btn btn-outline btn-sm" onClick={() => actions.collectPayment(o._id)}><Wallet size={15} /> {role === "rider" ? "Cash collected" : "Mark paid"}</button>}
    {canPickup && <button className="btn btn-outline btn-sm" onClick={() => actions.pickup(o._id, "Collected")}><Recycle size={15} /> Empties collected</button>}
    {canCancel && <button className="btn btn-danger-ghost btn-sm" onClick={cancel}>Cancel</button>}
  </div>;
}

const Row = ({ icon: Icon, label, children }) => <div className="info-row"><span><Icon size={16} /></span><div><small>{label}</small><b>{children}</b></div></div>;

export function OrderDrawer({ id, onClose }) {
  const { data, role, actions } = useApp();
  const o = data.orders.find(x => x._id === id) || data.archive.find(x => x._id === id);
  if (!o) return null;
  const riders = (data.users || []).filter(u => u.role === "rider" && u.active);
  const pin = o.deliveryLatitude != null && o.deliveryLongitude != null ? { lat: o.deliveryLatitude, lng: o.deliveryLongitude } : null;
  const mapsHref = pin ? `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.deliveryAddress || "")}`;
  const showProof = ["admin", "rider"].includes(role) && ["Out for Delivery", "Arrived", "Delivered", "Completed"].includes(o.status) && o.fulfillmentType !== "Pick Up";
  const newJugsToPrepare = Number(o.newEmptyGallonsPurchased) || o.items.filter(i => i.productType === "Empty Gallon" || i.type === "Empty Gallon" || i.product?.type === "Empty Gallon" || i.name === "Empty Gallon").reduce((sum, i) => sum + i.quantity, 0);
  return <Drawer title={o.orderNumber} subtitle={`Placed ${fmtDateTime(o.createdAt)}`} onClose={onClose}
    footer={<div className="drawer-foot"><button className="btn btn-ghost btn-sm" onClick={() => printReceipt(o) || alert("Please allow pop-ups to print the receipt.")}><Receipt size={15} /> Receipt</button>
      {role === "admin" && ["Completed", "Cancelled"].includes(o.status) && <button className="btn btn-ghost btn-sm" onClick={async () => { await actions.archive(o._id); onClose(); }}><Archive size={15} /> Archive</button>}
      <OrderActions order={o} compact /></div>}>
    <div className="drawer-status"><Status status={o.status} /><Status status={o.paymentStatus || "Pending"} /><span className="chip">{o.fulfillmentType === "Pick Up" ? <Store size={13} /> : <Truck size={13} />}{o.fulfillmentType || "Delivery"}</span></div>
    <Timeline order={o} />
    {role === "admin" && o.status === "Preparing" && newJugsToPrepare > 0 && <div className="prep-instruction" role="status"><PackageCheck size={22} /><b>📦 Prepare {newJugsToPrepare} water item{newJugsToPrepare === 1 ? "" : "s"} using BRAND NEW jugs from storage.</b></div>}

    <section className="d-sec"><h4>Customer &amp; destination</h4>
      <Row icon={UserRound} label="Customer">{o.customer?.name || "Customer"}{o.customer?.phone && <a className="inline-link" href={`tel:${o.customer.phone}`}> · <Phone size={12} /> {o.customer.phone}</a>}</Row>
      <Row icon={MapPin} label={o.fulfillmentType === "Pick Up" ? "Pick up at" : "Delivery address"}>{o.deliveryAddress}</Row>
      <Row icon={CalendarClock} label="Schedule">{o.deliveryDate ? fmtDate(o.deliveryDate) : "As soon as possible"} · {o.preferredTime}</Row>
      {o.fulfillmentType !== "Pick Up" && <Row icon={Truck} label="Rider">{o.rider?.name || "Not assigned yet"}{o.rider && (o.riderAcceptedAt ? <em className="ok-text"> · accepted</em> : <em className="warn-text"> · awaiting acceptance</em>)}</Row>}
      {o.fulfillmentType !== "Pick Up" && ["rider", "admin"].includes(role) && <a className="btn btn-outline btn-sm nav-btn" href={mapsHref} target="_blank" rel="noreferrer"><Navigation size={15} /> Get directions</a>}
      {role === "admin" && o.fulfillmentType !== "Pick Up" && !isFinal(o.status) && o.status !== "Delivered" && <Field label="Assign rider"><select value={o.rider?._id || o.rider || ""} onChange={e => e.target.value && actions.assignRider(o._id, e.target.value)}><option value="">Select a rider…</option>{riders.map(r => <option key={r._id} value={r._id}>{r.name} · {r.riderStatus || "Away"}</option>)}</select></Field>}
    </section>
    {pin && o.fulfillmentType !== "Pick Up" && <LocationPicker value={pin} readOnly height={170} />}

    <section className="d-sec"><h4>Items</h4>
      <table className="mini-table"><tbody>{o.items.map((i, k) => <tr key={k}><td>{i.name}</td><td>× {i.quantity}</td><td>{money(i.unitPrice * i.quantity)}</td></tr>)}</tbody><tfoot><tr><td colSpan={2}>Total</td><td>{money(o.total)}</td></tr></tfoot></table>
      <Row icon={CreditCard} label="Payment">{o.paymentMethod} · {o.paymentStatus || "Pending"}</Row>
      {o.emptyGallonsToPickup > 0 && <Row icon={Recycle} label="Empty gallons to collect">{o.emptyGallonsToPickup} gallon(s) · {o.pickupStatus}</Row>}
    </section>

    {showProof && <section className="d-sec"><h4>Proof of delivery</h4><ProofForm order={o} /></section>}
    {o.deliveredAt && o.deliveredTo && role === "customer" && <section className="d-sec"><h4>Delivery proof</h4><Row icon={PackageCheck} label="Received by">{o.deliveredTo}{o.deliveryProofNote ? ` — ${o.deliveryProofNote}` : ""}</Row></section>}
    {o.customerRating && <section className="d-sec"><h4>Customer feedback</h4><div className="fb-shown"><Stars value={o.customerRating} size={18} />{o.customerFeedback && <blockquote>“{o.customerFeedback}”</blockquote>}<small>{fmtDate(o.feedbackSubmittedAt)}</small></div></section>}
  </Drawer>;
}
