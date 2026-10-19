import { useEffect, useState } from "react";
import { ArrowRight, ArrowUp, Truck, ShieldCheck, Recycle, Star, MapPinned, Droplets, CheckCircle2, ChevronDown, Menu, X, Gift, Clock3, Bell, Phone } from "lucide-react";
import { Logo, Drop, Waves, Bubbles, Modal } from "./ui";
import { api } from "./api";
import { money } from "./lib";
import { getProductImage, STORE_METADATA } from "./config";

const FAQ = [
  ["How fast is delivery?", "Pick a delivery date and a time window at checkout. Once a rider is assigned you can follow every step — preparing, on the way, arrived — live from your account."],
  ["Can you take back my empty gallons?", "Yes. Add the number of empty gallons to your order and your rider collects them when they arrive. Returned containers go straight back into our stock."],
  ["How do I pay?", "Choose Cash on Delivery, GCash, Card, or Online at checkout. Your payment status is shown on every order and on your printable receipt."],
  ["Do I earn rewards?", "Every completed order earns 1 loyalty point for each ₱100 you spend. Your balance is always visible on your home screen."],
  ["Can I pick up instead?", "Absolutely. Choose Pick Up at checkout and we'll let you know the moment your order is ready at the station."]
];
const STEPS = [[ "Create your account", "Sign up in under a minute and confirm your delivery address once.", Droplets ], ["Choose your water", "Pick purified or mineral water, add empty gallons to return, set your time.", MapPinned], ["We prepare & dispatch", "The station confirms your order and a rider is assigned right away.", Truck], ["Track & enjoy", "Follow your rider live, pay, and rate the delivery.", Star]];

export default function Landing({ onAuth }) {
  const [menu, setMenu] = useState(false);
  const [products, setProducts] = useState([]);
  const [faq, setFaq] = useState(0);
  const [legal, setLegal] = useState(null);
  const [stationOpen, setStationOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { api("/products").then(p => setProducts(p.filter(x => x.type !== "Supply").slice(0, 3))).catch(() => {}); }, []);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 24); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  const jump = (id) => { setMenu(false); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return <div className="landing">
    <header className={`l-nav ${scrolled ? "scrolled" : ""}`}>
      <button className="plain" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="AquaFlow home"><Logo light={!scrolled} /></button>
      <nav className={menu ? "open" : ""}>
        <button onClick={() => jump("water")}>Our water</button><button onClick={() => jump("how")}>How it works</button><button onClick={() => jump("features")}>Features</button><button onClick={() => jump("faq")}>FAQ</button>
        <div className="l-nav-cta"><button className="btn btn-ghost-light" onClick={() => onAuth("login")}>Sign in</button><button className="btn btn-glow" onClick={() => onAuth("register")}>Get started <ArrowRight size={16} /></button></div>
      </nav>
      <button className="icon-btn l-burger" aria-label="Toggle menu" onClick={() => setMenu(m => !m)}>{menu ? <X size={22} /> : <Menu size={22} />}</button>
    </header>

    <section className="l-hero">
      <Bubbles count={18} />
      <div className="l-hero-inner">
        <div className="l-hero-copy">
          <span className="pill-light"><i /> Fresh water, on your schedule</span>
          <h1>Pure water,<br /><em>delivered to your door.</em></h1>
          <p>Order purified and mineral water in a few taps, schedule a time that suits you, and track your rider from the station to your doorstep.</p>
          <div className="l-hero-cta"><button className="btn btn-glow btn-lg" onClick={() => onAuth("register")}>Order water today <ArrowRight size={18} /></button><button className="btn btn-outline-light btn-lg" onClick={() => onAuth("login")}>I have an account</button></div>
          <ul className="l-trust"><li><CheckCircle2 size={16} /> Live order tracking</li><li><CheckCircle2 size={16} /> Empty gallon pickup</li><li><CheckCircle2 size={16} /> Earn loyalty points</li></ul>
        </div>
        <div className="l-hero-art" aria-hidden="true">
          <div className="gallon"><div className="gallon-cap" /><div className="gallon-neck" /><div className="gallon-body"><div className="gallon-water"><svg viewBox="0 0 200 40" preserveAspectRatio="none"><path className="wave-a" d="M0 20c25-14 50 14 75 0s50-14 75 0 35 8 50 0v20H0z" fill="rgba(255,255,255,.35)" /><path className="wave-b" d="M0 24c30-12 55 12 85 0s55-12 85 0 20 6 30 0v16H0z" fill="rgba(255,255,255,.25)" /></svg></div><span className="gallon-label"><Drop size={26} /><b>AquaFlow</b><small>5 gal · Purified</small></span></div></div>
          <div className="float-card f1"><span><Truck size={18} /></span><div><b>Rider on the way</b><small>Arriving in 12 min</small></div></div>
          <div className="float-card f2"><span><Star size={18} /></span><div><b>5.0 rating</b><small>"Fast and friendly!"</small></div></div>
          <div className="float-card f3"><span><Gift size={18} /></span><div><b>+3 points</b><small>Order completed</small></div></div>
        </div>
      </div>
      <Waves fill="#ffffff" />
    </section>

    <section className="l-section" id="water">
      <div className="l-head"><span className="eyebrow">Our water</span><h2>Clean, refreshing, and always in stock.</h2><p>Straight from the station catalog — prices and availability are live.</p></div>
      <div className="l-products">
        {(products.length ? products : [null, null, null]).map((p, i) => {
          const image = getProductImage(p);
          return <article key={p?._id || i} className={`l-product ${p ? "" : "skeleton"}`}>
            <div className="l-product-art">{image ? <button type="button" className="product-image-trigger" aria-label={`View full image of ${p.name}`} onClick={() => setImagePreview({ src: image, name: p.name })}><img className="product-photo" src={image} alt={p.name} loading="lazy" /></button> : <Drop size={64} />}{p && <span className={p.stock <= p.lowStockThreshold ? "low" : ""}>{p.stock > 0 ? (p.stock <= p.lowStockThreshold ? "Almost gone" : "In stock") : "Sold out"}</span>}</div>
            <h3>{p?.name || " "}</h3><p>{p ? (p.type === "Empty Gallon" ? "A fresh container for your dispenser." : `Treated and tested ${p.type.toLowerCase()} in a reusable 5-gallon container.`) : " "}</p>
            <div className="l-product-foot"><b>{p ? money(p.price) : " "}<small>{p ? ` / ${p.unit}` : ""}</small></b><button className="btn btn-sm btn-primary" onClick={() => onAuth("register")}>Order</button></div>
          </article>;
        })}
      </div>
    </section>

    <section className="l-section l-how" id="how">
      <div className="l-head"><span className="eyebrow">How it works</span><h2>From the tap to your table.</h2></div>
      <ol className="l-steps">{STEPS.map(([t, d, Icon], i) => <li key={t}><span className="l-step-num">{i + 1}</span><span className="l-step-icon"><Icon size={22} /></span><h3>{t}</h3><p>{d}</p></li>)}</ol>
    </section>

    <section className="l-section" id="features">
      <div className="l-head"><span className="eyebrow">Built for every role</span><h2>One platform, three happy workspaces.</h2></div>
      <div className="l-features">
        {[[Bell, "Real-time updates", "Instant notifications for new orders, riders arriving, payments, and stock changes."], [Truck, "Smart rider dispatch", "Orders are matched to the next ready rider automatically, or assigned by the admin."], [Recycle, "Empty gallon returns", "Riders collect empties at the door and your container stock updates itself."], [MapPinned, "Pin your location", "Drop a pin on the map so your rider finds you the first time."], [Gift, "Loyalty points", "Earn a point for every ₱100 on completed orders."], [ShieldCheck, "Secure & transparent", "Role-based access, audit logs, delivery proof, and printable receipts."]].map(([Icon, t, d]) =>
          <article key={t}><span><Icon size={22} /></span><h3>{t}</h3><p>{d}</p></article>)}
      </div>
    </section>

    <section className="l-section l-faq" id="faq">
      <div className="l-head"><span className="eyebrow">FAQ</span><h2>Good questions, clear answers.</h2></div>
      <div className="faq">{FAQ.map(([q, a], i) => <div key={q} className={`faq-item ${faq === i ? "open" : ""}`}><button onClick={() => setFaq(faq === i ? -1 : i)} aria-expanded={faq === i}>{q}<ChevronDown size={18} /></button><div className="faq-a"><p>{a}</p></div></div>)}</div>
    </section>

    <section className="l-cta"><Bubbles count={10} /><div><h2>Ready for your first refill?</h2><p>Create a free account and place your first order in minutes.</p></div><button className="btn btn-glow btn-lg" onClick={() => onAuth("register")}>Create my account <ArrowRight size={18} /></button></section>

    <footer className="l-foot">
      <Logo light /><p>© {new Date().getFullYear()} AquaFlow Water Refilling Station. Clean water. Better service.</p>
      <div><button onClick={() => jump("how")}>How it works</button><button onClick={() => setLegal("privacy")}>Privacy Policy</button><button onClick={() => setLegal("terms")}>Terms of Service</button><button onClick={() => setStationOpen(true)}>Visit Our Station</button><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp size={14} /> Back to top</button></div>
    </footer>
    {legal && <Modal title={legal === "privacy" ? "Privacy Policy" : "Terms of Service"} onClose={() => setLegal(null)} footer={<button className="btn btn-primary" onClick={() => setLegal(null)}>Close</button>}><Legal kind={legal} /></Modal>}
    {stationOpen && <Modal title="Visit Our Station" subtitle={STORE_METADATA.name} onClose={() => setStationOpen(false)} wide footer={<button className="btn btn-primary" onClick={() => setStationOpen(false)}>Close</button>}>
      <div className="stack">
        <iframe
          title={`${STORE_METADATA.name} map`}
          src={`https://www.google.com/maps?q=${STORE_METADATA.coordinates.lat},${STORE_METADATA.coordinates.lng}&z=17&output=embed`}
          style={{ height: 300, display: "block", width: "100%", border: 0, borderRadius: 12 }}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <p><MapPinned size={16} /> {STORE_METADATA.address}</p>
        <p><Clock3 size={16} /> Opening hours: Daily, 8:00 AM-8:00 PM</p>
        <a className="btn btn-outline" href={STORE_METADATA.mapsLink} target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>
      </div>
    </Modal>}
    {imagePreview && <Modal title={imagePreview.name} onClose={() => setImagePreview(null)} wide footer={<button className="btn btn-primary" onClick={() => setImagePreview(null)}>Close</button>}>
      <img className="image-preview" src={imagePreview.src} alt={imagePreview.name} />
    </Modal>}
  </div>;
}

export function Legal({ kind }) {
  return kind === "privacy" ? <div className="legal">
    <p><b>What we collect.</b> Your name, email, phone number, delivery addresses and optional map coordinates, plus your order and payment records.</p>
    <p><b>How we use it.</b> To process orders, coordinate delivery with riders, issue receipts, track inventory, and send in-app updates.</p>
    <p><b>Who sees it.</b> Station administrators see account and order records. Your assigned rider sees only what is needed to deliver your order.</p>
    <p><b>Your choices.</b> Contact the station administrator to correct or request removal of your information.</p></div>
  : <div className="legal">
    <p><b>1. Accurate information.</b> Provide a valid name, email, contact details, and delivery address.</p>
    <p><b>2. Orders and availability.</b> Orders depend on available stock and confirmation by AquaFlow staff.</p>
    <p><b>3. Delivery.</b> Delivery windows are estimates and may change due to operational conditions.</p>
    <p><b>4. Payments.</b> Payment status reflects the record entered by authorized staff or your rider.</p>
    <p><b>5. Account security.</b> Keep your password private and use the system only for legitimate orders.</p>
    <p><b>6. Personal information.</b> Your details are used to process orders, coordinate delivery, and support the service.</p>
    <p><b>7. Updates.</b> Order statuses change as staff process and deliver your order.</p></div>;
}
