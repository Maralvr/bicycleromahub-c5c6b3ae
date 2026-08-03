---
name: Livitaly needs no guide
description: Only Livitaly tours skip guide assignment; Le Meridien and Roma 'n Bike are partner-tagged but still guide-assignable
type: constraint
---
Only Livitaly / "Appia Antica by Livitaly" bookings must never be assigned a Bicycle Roma guide (`isNoGuideTour` in src/lib/partner-tours.ts). **Why:** Livitaly provides its own guide.

Le Meridien Visconti and Roma 'n Bike Card are partner-tagged (Partner badge) but DO still get guides assigned — do not block assignment for them.

How to apply:
- assign-guide-combobox shows "Partner-operated — no guide needed" only for isNoGuideTour shifts when unassigned.
- Auto-assign (shifts.tsx) and bulk dispatch skip only isNoGuideTour shifts.
- Partner badge/visibility (isPartnerTour) still covers all three products.
