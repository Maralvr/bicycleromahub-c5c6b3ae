---
name: Partner tours never get a guide
description: Livitaly / Le Meridien Visconti / Roma 'n Bike partner tours are visible but not assignable to guides
type: constraint
---
Partner-operated bookings (isPartnerTour in src/lib/partner-tours.ts — Livitaly / Appia Antica, Le Meridien Visconti, Roma 'n Bike Card) must never be assigned a Bicycle Roma guide. **Why:** the partner services them.

How to apply:
- Assign/reassign picker (assign-guide-combobox) shows a "Partner-operated — no guide needed" notice instead of the combobox when unassigned.
- Excluded from auto-assign (shifts.tsx autoAssignAll) and bulk dispatch suggestions.
- They stay fully visible and enriched everywhere, tagged with the Partner badge.
