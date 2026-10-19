import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { LocateFixed, Search, MapPin, ExternalLink } from "lucide-react";

const DEFAULT = { lat: 14.5378, lng: 121.0014 };
const pin = L.divIcon({ className: "af-pin", html: '<span></span>', iconSize: [34, 42], iconAnchor: [17, 40] });

// Click or drag to pin a location. `readOnly` shows a static map. Needs internet for OSM tiles/search.
export default function LocationPicker({ value, onChange, onAddress, readOnly = false, height = 260 }) {
  const el = useRef(null), map = useRef(null), marker = useRef(null), cb = useRef({});
  const [q, setQ] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const reverseRequest = useRef(0);
  cb.current = { onChange, onAddress };

  async function reverse(lat, lng) {
    if (!cb.current.onAddress) return;
    const request = ++reverseRequest.current;
    setMsg("Looking up address…");
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
      if (!r.ok) throw new Error(`Address lookup failed (${r.status}).`);
      const j = await r.json();
      if (!j.display_name) throw new Error("No address was found for this pin.");
      if (request === reverseRequest.current) {
        cb.current.onAddress?.(j.display_name);
        setMsg("");
      }
    } catch {
      if (request === reverseRequest.current) setMsg("Couldn't find an address for this pin. The map location is still saved.");
    }
  }
  function place(lat, lng, fly = false, lookup = true) {
    if (!map.current) return;
    if (!marker.current) {
      marker.current = L.marker([lat, lng], { icon: pin, draggable: !readOnly }).addTo(map.current);
      marker.current.on("dragend", () => { const p = marker.current.getLatLng(); cb.current.onChange?.({ lat: p.lat, lng: p.lng }); reverse(p.lat, p.lng); });
    } else marker.current.setLatLng([lat, lng]);
    if (fly) map.current.flyTo([lat, lng], Math.max(map.current.getZoom(), 16), { duration: .6 });
    if (lookup) { cb.current.onChange?.({ lat, lng }); reverse(lat, lng); }
  }

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true }).setView(value ? [value.lat, value.lng] : [DEFAULT.lat, DEFAULT.lng], value ? 16 : 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(m);
    map.current = m;
    if (value) place(value.lat, value.lng, false, false);
    if (!readOnly) m.on("click", e => place(e.latlng.lat, e.latlng.lng));
    setTimeout(() => m.invalidateSize(), 120);
    return () => { m.remove(); map.current = null; marker.current = null; };
  }, []); // eslint-disable-line
  useEffect(() => { if (value && map.current) { if (!marker.current) place(value.lat, value.lng, true, false); else marker.current.setLatLng([value.lat, value.lng]); } }, [value?.lat, value?.lng]); // eslint-disable-line

  function locate() {
    if (!navigator.geolocation) return setMsg("Your browser can't share its location.");
    setMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(p => { setMsg(""); place(p.coords.latitude, p.coords.longitude, true); }, () => setMsg("Couldn't get your location. Allow location access or search for your address."), { enableHighAccuracy: true, timeout: 10000 });
  }
  async function search() {
    if (!q.trim()) {
      setMsg("Enter an address or landmark to search.");
      return;
    }
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&q=${encodeURIComponent(q.trim())}`);
      if (!r.ok) throw new Error(`Location search failed (${r.status}).`);
      const j = await r.json();
      if (!j[0]) setMsg("No match found. Try adding the barangay or city.");
      else {
        const lat = Number(j[0].lat), lng = Number(j[0].lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("The location result was invalid.");
        reverseRequest.current++;
        place(lat, lng, true, false);
        cb.current.onChange?.({ lat, lng });
      }
    }
    catch (error) {
      if (error instanceof Error && (error.message.startsWith("Location search failed") || error.message === "The location result was invalid.")) setMsg(error.message);
      else setMsg("Search needs an internet connection.");
    } finally { setBusy(false); }
  }
  const link = value ? `https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lng}#map=17/${value.lat}/${value.lng}` : null;
  return <div className="locpicker">
    {!readOnly && <div className="loc-bar"><div className="loc-search" role="search"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); search(); } }} placeholder="Search your street, barangay or landmark" aria-label="Search address or landmark" /><button type="button" className="btn btn-sm btn-primary" disabled={busy || !q.trim()} onClick={search}>{busy ? "…" : "Find"}</button></div>
      <button type="button" className="btn btn-sm btn-outline" onClick={locate}><LocateFixed size={15} /> Use my location</button></div>}
    <div ref={el} className="loc-map" style={{ height }} />
    <div className="loc-foot"><span><MapPin size={14} />{value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : readOnly ? "No pin saved for this address" : "Tap the map to drop a pin, or drag it to adjust."}</span>{link && <a href={link} target="_blank" rel="noreferrer">Open map <ExternalLink size={13} /></a>}{msg && <em>{msg}</em>}</div>
  </div>;
}
