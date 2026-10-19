import { moneyShort, money } from "../lib";
const COLORS = { Pending: "#f59e0b", Confirmed: "#14b8e8", Preparing: "#6366f1", "Out for Delivery": "#8b5cf6", Arrived: "#0d9488", Delivered: "#22c55e", Completed: "#059669", Cancelled: "#ef4444" };

export function BarChart({ rows, height = 190 }) {
  const max = Math.max(1, ...rows.map(r => r.sales)); const w = 100 / Math.max(1, rows.length);
  return <div className="bars" style={{ height }} role="img" aria-label="Monthly sales">
    {rows.map(r => <div key={r.key} className="bar-col" style={{ width: `${w}%` }}><span className="bar-val">{r.sales ? moneyShort(r.sales) : ""}</span>
      <div className="bar-track"><div className="bar" style={{ height: `${Math.max(r.sales ? 4 : 0, r.sales / max * 100)}%` }} title={`${r.label}: ${money(r.sales)}`} /></div><small>{r.label}</small></div>)}</div>;
}
export function Donut({ rows, size = 168 }) {
  const total = rows.reduce((s, r) => s + r.count, 0); const R = 62, C = 2 * Math.PI * R; let off = 0;
  return <div className="donut-wrap"><svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label="Orders by status">
    <circle cx="80" cy="80" r={R} fill="none" stroke="var(--line)" strokeWidth="18" />
    {total > 0 && rows.map(r => { const len = r.count / total * C; const el = <circle key={r.status} cx="80" cy="80" r={R} fill="none" stroke={COLORS[r.status] || "#14b8e8"} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 80 80)"><title>{r.status}: {r.count}</title></circle>; off += len; return el; })}
    <text x="80" y="78" textAnchor="middle" className="donut-n">{total}</text><text x="80" y="96" textAnchor="middle" className="donut-l">orders</text></svg>
    <ul className="legend">{[...rows].sort((a, b) => b.count - a.count).map(r => <li key={r.status}><i style={{ background: COLORS[r.status] || "#14b8e8" }} />{r.status}<b>{r.count}</b></li>)}{!rows.length && <li className="muted">No orders yet</li>}</ul></div>;
}
export function Sparkline({ values, w = 120, h = 36 }) {
  if (!values.length) return null; const max = Math.max(1, ...values), step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${i * step},${h - 4 - (v / max) * (h - 8)}`).join(" ");
  return <svg width={w} height={h} className="spark" aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
