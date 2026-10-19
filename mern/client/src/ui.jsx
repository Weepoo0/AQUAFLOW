import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Star, CheckCircle2, AlertTriangle, Info, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { slug, initials } from "./lib";

/* ---------- Brand ---------- */
export function Drop({ size = 28, className = "" }) {
  const id = useRef(`g${Math.random().toString(36).slice(2, 7)}`).current;
  return <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7be3ff" /><stop offset="1" stopColor="#0a7bb5" /></linearGradient></defs>
    <path d="M32 3C32 3 11 26 11 41a21 21 0 0 0 42 0C53 26 32 3 32 3z" fill={`url(#${id})`} />
    <path d="M22 41a10 10 0 0 0 8 9.8" stroke="#fff" strokeOpacity=".75" strokeWidth="3.5" strokeLinecap="round" fill="none" />
  </svg>;
}
export function Logo({ light = false, sub = true }) {
  return <span className={`logo ${light ? "logo-light" : ""}`}><Drop size={34} /><span><b>AquaFlow</b>{sub && <small>Water Refilling Station</small>}</span></span>;
}
export function Waves({ flip = false, fill = "var(--foam)" }) {
  return <svg className={`waves ${flip ? "flip" : ""}`} viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
    <path className="wave-a" fill={fill} fillOpacity=".5" d="M0 60C180 20 360 100 540 70s360-60 540-30 270 40 360 20v60H0z" />
    <path className="wave-b" fill={fill} d="M0 80c160-30 320 20 480 10s320-50 480-30 320 40 480 10v60H0z" />
  </svg>;
}
export function Bubbles({ count = 14 }) {
  return <div className="bubbles" aria-hidden="true">{Array.from({ length: count }, (_, i) => <i key={i} style={{ left: `${(i * 37 + 7) % 100}%`, width: 8 + (i * 7) % 22, height: 8 + (i * 7) % 22, animationDelay: `${(i * 1.3) % 9}s`, animationDuration: `${9 + (i * 2) % 9}s` }} />)}</div>;
}

/* ---------- UI context: toasts + confirm ---------- */
const UICtx = createContext(null);
export const useUI = () => useContext(UICtx);
export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const toast = useCallback((message, type = "success") => {
    const id = `${Date.now()}${Math.random()}`;
    setToasts(t => [...t.slice(-3), { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), type === "error" ? 6500 : 4200);
  }, []);
  const confirm = useCallback((opts) => new Promise(resolve => setDialog({ ...opts, resolve })), []);
  const close = (v) => { dialog?.resolve(v); setDialog(null); };
  return <UICtx.Provider value={{ toast, confirm }}>
    {children}
    <div className="toasts" role="status" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast toast-${t.type}`}>
      {t.type === "error" ? <AlertTriangle size={18} /> : t.type === "info" ? <Info size={18} /> : <CheckCircle2 size={18} />}<span>{t.message}</span>
      <button aria-label="Dismiss" onClick={() => setToasts(x => x.filter(y => y.id !== t.id))}><X size={15} /></button></div>)}</div>
    {dialog && <Modal title={dialog.title} onClose={() => close(false)} small footer={<>
      <button className="btn btn-ghost" onClick={() => close(false)}>{dialog.cancelText || "Cancel"}</button>
      <button className={`btn ${dialog.danger ? "btn-danger" : "btn-primary"}`} onClick={() => close(true)} autoFocus>{dialog.confirmText || "Confirm"}</button></>}>
      <div className="confirm-body">{dialog.body}</div></Modal>}
  </UICtx.Provider>;
}

/* ---------- Primitives ---------- */
export function Modal({ title, subtitle, onClose, children, footer, small = false, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey); document.body.classList.add("no-scroll");
    return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("no-scroll"); };
  }, [onClose]);
  return createPortal(<div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
    <section className={`modal ${small ? "modal-sm" : ""} ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
      <div className="modal-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </section></div>, document.body);
}
export function Drawer({ title, subtitle, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey); document.body.classList.add("no-scroll");
    return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("no-scroll"); };
  }, [onClose]);
  return createPortal(<div className="drawer-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
      <header><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
      <div className="drawer-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </aside></div>, document.body);
}
export const Status = ({ status }) => <span className={`badge badge-${slug(status || "Pending")}`}><i />{status || "Pending"}</span>;
export function Avatar({ name, size = 38 }) { return <span className="avatar" style={{ width: size, height: size, fontSize: size * .38 }}>{initials(name)}</span>; }
export function Stars({ value = 0, size = 16, onChange }) {
  return <span className={`stars ${onChange ? "stars-input" : ""}`}>{[1, 2, 3, 4, 5].map(n => onChange
    ? <button type="button" key={n} aria-label={`${n} star${n > 1 ? "s" : ""}`} className={n <= value ? "on" : ""} onClick={() => onChange(n)}><Star size={size} fill={n <= value ? "currentColor" : "none"} /></button>
    : <Star key={n} size={size} className={n <= Math.round(value) ? "on" : ""} fill={n <= Math.round(value) ? "currentColor" : "none"} />)}</span>;
}
export function Empty({ icon: Icon, title, text, action }) {
  return <div className="empty"><span className="empty-icon">{Icon && <Icon size={26} />}</span><b>{title}</b>{text && <p>{text}</p>}{action}</div>;
}
export function Pager({ page, pages, onPage, total, size }) {
  if (pages <= 1) return null;
  return <div className="pager"><span>{(page - 1) * size + 1}–{Math.min(page * size, total)} of {total}</span>
    <div><button className="icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={17} /></button>
      <b>{page} / {pages}</b>
      <button className="icon-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={17} /></button></div></div>;
}
export const PageHead = ({ eyebrow, title, text, children }) => <div className="page-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{text && <p>{text}</p>}</div>{children && <div className="page-head-actions">{children}</div>}</div>;
export const Card = ({ title, text, action, children, className = "", pad = true }) => <section className={`card ${className}`}>{(title || action) && <header className="card-head"><div>{title && <h3>{title}</h3>}{text && <p>{text}</p>}</div>{action}</header>}<div className={pad ? "card-body" : ""}>{children}</div></section>;
export const Tabs = ({ items, value, onChange }) => <div className="tabs" role="tablist">{items.map(([k, label, count]) => <button role="tab" aria-selected={value === k} key={k} className={value === k ? "active" : ""} onClick={() => onChange(k)}>{label}{count !== undefined && <span>{count}</span>}</button>)}</div>;
export const Field = ({ label, hint, children }) => <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
export function Stepper({ value, onChange, min = 0, max = 99 }) {
  return <div className="stepper"><button type="button" aria-label="Decrease" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button><b>{value}</b><button type="button" aria-label="Increase" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button></div>;
}
export function PasswordMeter({ value }) {
  const checks = [value.length >= 12, /[0-9]/.test(value), /[^A-Za-z0-9]/.test(value), /[a-z]/.test(value) && /[A-Z]/.test(value)];
  const score = checks.filter(Boolean).length;
  return <div className="pw-meter"><div className="pw-bars">{[0, 1, 2, 3].map(i => <i key={i} className={i < score ? `on s${score}` : ""} />)}</div>
    <small>{value ? (checks[0] && checks[1] && checks[2] ? "Meets the AquaFlow password rules" : "12+ characters, a number and a symbol") : "12+ characters, a number and a symbol"}</small></div>;
}

export function SearchBox({ q, setQ, ph, placeholder = ph || "Search…", className = "" }) {
  const ref = useRef(null);
  return (
    <div
      className={`box search ${q ? "has-val" : ""} ${className}`.trim()}
      onClick={() => ref.current?.focus()}
      role="search"
    >
      <input
        ref={ref}
        type="text"
        className="box-input"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {q ? (
        <button
          type="button"
          className="box-clear"
          title="Clear search"
          aria-label="Clear search"
          onClick={(e) => {
            e.stopPropagation();
            setQ("");
            ref.current?.focus();
          }}
        >
          <X size={14} />
        </button>
      ) : null}
      <a
        href="#"
        className="search-btn"
        onClick={(e) => {
          e.preventDefault();
          ref.current?.focus();
        }}
        aria-label="Search"
        tabIndex={-1}
      >
        <Search size={18} />
      </a>
    </div>
  );
}

