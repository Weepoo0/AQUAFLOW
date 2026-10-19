# AquaFlow — Water Refilling Station System (MERN)

Customers order water, riders deliver it, admins run the station — with live updates between all three.

## Run it
```bash
npm install && npm run install:all     # installs root, server and client
cp server/.env.example server/.env     # then set MONGO_URI and a long random JWT_SECRET
npm run seed                           # optional demo data (RESETS the database)
npm run dev                            # API :5000 + web :5173
```
Demo logins after seeding (password `AquaFlow123!`): `admin@aquaflow.test`, `maria@aquaflow.test` (customer), `rider@aquaflow.test` (rider).

## The order flow
1. **Customer** places a Delivery or Pick Up order (pin on map, schedule, empty-gallon return, payment method). Stock is reserved.
2. A **Ready rider is auto-assigned**, or the **admin** assigns one. The rider accepts.
3. Admin/rider move delivery orders: Confirmed → Preparing → Out for Delivery → Arrived → Delivered. Pick Up orders go Preparing → Ready for Pick Up → Completed, so customers know when to head to the station.
4. Rider collects empties, takes cash (COD) and records proof of delivery.
5. Delivered + Paid ⇒ the order **auto-completes**, the rider is freed and the customer earns **1 point per ₱100**.
6. Customer rates the delivery; admin and rider see the rating.

## What changed in this version
**Design:** full redesign — water/ocean theme, new landing page (live product catalog, FAQ), split-screen auth, new sidebar shell, drawers, modals and toasts (no more `window.confirm/alert`), SVG charts, responsive down to phones.
**New features:** persistent login, order detail drawer with timeline and map, admin delivery board, rider online/away toggle, rider "cash collected", draggable-pin Leaflet map with address search, change password, admin password reset, admin address unlock, report date ranges/top products/rider performance, global notifications with deep links.
**Bugs fixed:**
- Admin account update/deactivate crashed (`address` was undefined).
- Admin "Arrived" step was rejected by the server.
- Loyalty points were advertised but never awarded.
- Cancelling an order never freed its rider.
- `npm run build` ran `vite` instead of `vite build`; circular `aquaflow-mern: file:..` dependencies removed.
- Pick Up orders could be sent for delivery; finished orders could be changed.
- Customers could only cancel `Pending` orders, which auto-assignment made nearly impossible.

## Archive, delete & restore, loyalty points
**Archive Management** (admin → Archive). *Archive a record* picks a product or an order; the server checks eligibility and either archives it (data kept, `archivedAt`/`archivedBy` recorded, audit-logged) or returns the reason.
- Orders: only **Completed (paid)** or **Cancelled** orders can be archived. Pending and in-progress orders stay in the active lists. To keep completed orders in history for good, remove `"Completed"` from `ARCHIVABLE_ORDER_STATUSES` in `server/lib/archive.js`.
- Products: a product that is part of a pending or in-progress order can't be archived.

**Delete & restore a product.** *Inventory → Delete* asks for confirmation, then the server soft-deletes the product (`active: false`). Stock, price and the original image path are untouched, and the image file is never removed. *Archive → Archived products → Restore* is handled by the server (`PATCH /api/products/:id/restore`) and the product returns to Inventory with its image. *Delete permanently* is a separate action, only available for archived products.

**Loyalty points.** 1 point per full ₱100 when an order is **Completed and paid**. Every change is a row in the `LoyaltyTransaction` collection (earned / redeemed / adjusted); a unique index guarantees an order can only be awarded once. Customers see their balance and history under *Loyalty points* (`GET /api/loyalty/me`). `redeemLoyaltyPoints()` in `server/lib/loyalty.js` is ready for a future redemption feature (it checks the balance atomically) but nothing in the app calls it yet.

**Existing database?** Run `npm run backfill:loyalty -- --dry-run` once, then `npm run backfill:loyalty`, to build history rows for points that were awarded before the ledger existed. (`npm run seed` already creates them for demo data.)

## Notes
- Payments record the chosen method only; there is no live GCash/card gateway.
- Map tiles and address search use OpenStreetMap/Nominatim (internet required, light usage only).
- Forgot password: an admin resets it from **Accounts → Reset password** (no email service is configured).
- Your original zip contained a real `server/.env` with a JWT secret. It is not included here — generate a new secret.
