import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail, Lock, UserRound, Phone, CheckCircle2, Truck, RefreshCw, MessageSquareWarning, KeyRound } from "lucide-react";
import { Logo, Bubbles, Waves, Modal, PasswordMeter } from "./ui";
import { Legal } from "./Landing";
import { api } from "./api";

const TITLES = { login: ["Welcome back", "Sign in to manage your water orders."], register: ["Create your account", "A few details and you're ready to order."], appeal: ["Appeal a deactivation", "Deactivated accounts can be appealed within 7 days."], forgot: ["Forgot your password?", "Here's how to get back in."] };

export default function Auth({ mode, setMode, onBack, onAuthed }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", message: "" });
  const [show, setShow] = useState(false);
  const [terms, setTerms] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));
  const switchTo = (m) => { setMode(m); setError(""); setOk(""); setShow(false); };

  async function submit(e) {
    e.preventDefault(); setError(""); setOk("");
    if (mode === "register") {
      if (!terms) return setError("Please accept the Terms and Conditions to create your account.");
      if (f.password.length < 12 || !/[0-9]/.test(f.password) || !/[^A-Za-z0-9]/.test(f.password)) return setError("Use a password with at least 12 characters, including a number and a symbol.");
    }
    setBusy(true);
    try {
      if (mode === "appeal") { const r = await api("/auth/appeal", { method: "POST", body: { email: f.email, message: f.message } }); setOk(r.message); setF(p => ({ ...p, message: "" })); }
      else { const r = await api(mode === "register" ? "/auth/register" : "/auth/login", { method: "POST", body: mode === "register" ? { name: f.name, email: f.email, phone: f.phone, password: f.password } : { email: f.email, password: f.password } }); onAuthed(r); }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const [title, sub] = TITLES[mode];

  return <div className="auth">
    <aside className="auth-art"><Bubbles count={16} />
      <button className="auth-back" onClick={onBack}><ArrowLeft size={16} /> Back to home</button>
      <div className="auth-art-inner"><Logo light />
        <h2>Every drop,<br /><em>delivered with care.</em></h2>
        <ul><li><CheckCircle2 size={18} /> Live order tracking from station to door</li><li><Truck size={18} /> Smart rider dispatch &amp; empty gallon pickup</li><li><CheckCircle2 size={18} /> Loyalty points on every completed order</li></ul></div>
      <Waves fill="#0a5a82" />
    </aside>
    <main className="auth-panel">
      <button className="auth-back mobile" onClick={onBack}><ArrowLeft size={16} /> Home</button>
      <form className="auth-card" onSubmit={submit} noValidate={false}>
        <div className="auth-mobile-logo"><Logo /></div>
        <span className="eyebrow">{mode === "register" ? "Get started" : mode === "appeal" ? "Account recovery" : mode === "forgot" ? "Password help" : "AquaFlow account"}</span>
        <h1>{title}</h1><p className="auth-sub">{sub}</p>

        {mode === "forgot" ? <div className="forgot">
          <div className="forgot-step"><KeyRound size={20} /><p>Password resets are handled by the station for your security. Ask an AquaFlow administrator to reset your password from <b>Accounts → Reset password</b>, then sign in with the temporary password and change it in your profile.</p></div>
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => switchTo("login")}>Back to sign in</button>
        </div> : <>
          {mode === "register" && <label className="input"><span>Full name</span><div><UserRound size={17} /><input value={f.name} onChange={set("name")} placeholder="Juan Dela Cruz" autoComplete="name" required /></div></label>}
          <label className="input"><span>Email address</span><div><Mail size={17} /><input type="email" value={f.email} onChange={set("email")} placeholder="you@example.com" autoComplete="email" required /></div></label>
          {mode === "register" && <label className="input"><span>Mobile number <em>(optional)</em></span><div><Phone size={17} /><input value={f.phone} onChange={set("phone")} placeholder="09XX XXX XXXX" autoComplete="tel" inputMode="tel" /></div></label>}
          {mode !== "appeal" && <label className="input"><span>Password</span><div><Lock size={17} /><input type={show ? "text" : "password"} value={f.password} onChange={set("password")} placeholder={mode === "register" ? "Create a strong password" : "Enter your password"} autoComplete={mode === "register" ? "new-password" : "current-password"} required /><button type="button" className="eye" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(s => !s)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{mode === "register" && <PasswordMeter value={f.password} />}</label>}
          {mode === "appeal" && <label className="input"><span>Appeal message</span><div className="ta"><MessageSquareWarning size={17} /><textarea rows={4} maxLength={1000} value={f.message} onChange={set("message")} placeholder="Tell the administrator why your account should be reactivated." required /></div></label>}
          {mode === "login" && <button type="button" className="link forgot-link" onClick={() => switchTo("forgot")}>Forgot password?</button>}
          {mode === "register" && <label className="check"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} /><span>I agree to the <button type="button" className="link" onClick={() => setTermsOpen(true)}>Terms and Conditions</button></span></label>}
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {ok && <div className="alert alert-ok" role="status">{ok}</div>}
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? <><RefreshCw size={17} className="spin" /> Please wait…</> : <>{mode === "register" ? "Create account" : mode === "appeal" ? "Submit appeal" : "Sign in"} <ArrowRight size={17} /></>}</button>
          <p className="auth-switch">{mode === "register" ? <>Already have an account? <button type="button" className="link" onClick={() => switchTo("login")}>Sign in</button></> : mode === "appeal" ? <>Back to <button type="button" className="link" onClick={() => switchTo("login")}>sign in</button></> : <>New to AquaFlow? <button type="button" className="link" onClick={() => switchTo("register")}>Create an account</button></>}</p>
          {mode === "login" && <p className="auth-switch">Account deactivated? <button type="button" className="link" onClick={() => switchTo("appeal")}>Submit an appeal</button></p>}
        </>}
      </form>
    </main>
    {termsOpen && <Modal title="Terms and Conditions" onClose={() => setTermsOpen(false)} footer={<><button className="btn btn-ghost" onClick={() => setTermsOpen(false)}>Close</button><button className="btn btn-primary" onClick={() => { setTerms(true); setTermsOpen(false); }}>I agree</button></>}><Legal kind="terms" /></Modal>}
  </div>;
}
