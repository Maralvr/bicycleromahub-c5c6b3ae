# Project Memory

## Core
Never show booking rate / fee / cost (€ amounts, `shift.rate`) to tour guides. Admin-only. `rateTitle` (language/name label) is OK.
Admin `pelei.alessio@gmail.com` can toggle between admin and guide view via the top-right switch in app-shell.
No cap on guides per tour — admins can add unlimited additional guides.

## Memories
- [Rate visibility](mem://constraints/rate-visibility) — Where rate is gated and the pattern to follow for new UI
- [No guide for partner tours](mem://constraints/no-guide-for-partner-tours) — Livitaly/Le Meridien/Roma 'n Bike are visible but never guide-assignable
- [Rental assignment managers](mem://features/rental-assignment-managers) — Who besides admins can assign rental staff to points; never cap assignments per day
- [Rental-point staff](mem://features/rental-staff) — Separate roster, per-day assignments, swaps the Shifts page + bell for rental_staff role
- [Rental staff pay rates](mem://features/rental-staff-pay-rates) — Flat+seasonal double-shift vs per-time-range models, day-level payouts and freeze-on-paid
- [No guide limit](mem://constraints/no-guide-limit) — Unlimited additional guides per shift; never add count caps in UI or DB
