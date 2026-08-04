# Show all tours (not just rentals) under rental points

## 1. Meeting-point data quality — findings from live data

3,597 shifts. 332 (9%) are `TBD`. The rest are far cleaner than expected: 36 distinct values cover the last 90 days, and nearly all follow the Bokun pattern
`<place label> — <street> <number>, Roma, <ZIP>, IT`.

Top values and how they'd map:

| Meeting point (grouped) | Count | Street signal |
|---|---|---|
| Bicycl-e Appia Antica Bike Point — Via Appia Antica 175 | ~575 | Via Appia Antica |
| Basilica San Sebastiano (3 spelling variants) — Via Appia Antica 136 | ~270 | Via Appia Antica |
| StarsBOX ROMA — Via Appia Antica 300 | 19 | Via Appia Antica |
| Lungotevere delle Armi 44 (6+ label variants) | ~400 | Lungotevere delle Armi |
| Bicycl-e Piazza Venezia Bike Point — Via del Gesù 91 | 7 | Via del Gesù |
| Bike Shuttle / RUVER pizzeria — Viale Aventino 46 | ~270 | no rental point |
| Easy Bike — Via dei Cerchi 59 | 92 | no rental point |
| Villa Borghese — Largo Pablo Picasso | 15 | no rental point |
| Le Meridien Visconti — Via Federico Cesi 37 | 1 | no rental point (partner) |
| TBD / bare fragments ("Appia", "Via appia antica 136") | ~345 | partial |

Noise is limited to: label spelling variants, casing, one typo (`Via AppiaAntica 136`), sometimes-missing ZIP/country tail, and bare-address rows without a label. All of that is handled by normalised substring matching. So: **structured enough to match reliably — no geocoding needed.**

Rental point rows to match against:

```text
Appia Antica    | via appia antica 175       | Rome
Lungotevere     | Lungotevere delle Armi, 44 | Rome
Piazza Venezia  | via del Gesù 91            | Rome
```

Key judgement call: Via Appia Antica **136** / **300** are not the rental point's own address (175), but they're on the same street in the same area — Maral's intent ("everything happening at their location") means these should count. So matching is **street-level, not house-number-level**.

## 2. Matching mechanism

Driven by the live `rental_points` table, not a hardcoded map. For each point derive matchable keys:

1. Normalise both sides: lowercase, strip accents, collapse whitespace/punctuation, drop the `, Roma, 00179, IT` tail, and drop house numbers.
2. Keys per point, in priority order:
   - the point's `name` (`appia antica`, `lungotevere`, `piazza venezia`)
   - the point's street from `address` with the number removed (`via appia antica`, `lungotevere delle armi`, `via del gesu`)
3. A shift matches a point when any key appears as a substring of the normalised meeting point. Longest key wins; if two different points match, treat as ambiguous → unmatched (safe default).
4. `TBD`, empty, or shorter-than-4-char meeting points → unmatched.

Against the live data this yields: all Appia Antica variants (175/136/300, incl. the `AppiaAntica` typo, via the `appia antica` name key), all Lungotevere variants, Piazza Venezia via `via del gesu`. Viale Aventino, Via dei Cerchi, Villa Borghese, Le Meridien stay unmatched — correct, they're not at a rental point.

Existing rental-product matching (`rentalLocationForBooking`) stays exactly as-is; this is a second, independent signal.

## 3. Where it's computed and stored — recommendation

**Compute client-side on the fly** (a shared `matchRentalPointByMeetingPoint(meetingPoint, points)` helper in `src/lib/rental-point-match.ts`), used by the rental-point calendars and the "All rental points" view.

Why, over a new `matched_rental_point_id` column:
- Zero migration, zero backfill, retroactive for free, instantly reversible.
- Never stale: edit a rental point's name/address and matching re-resolves immediately.
- Cost is trivial: a few string ops over shifts already loaded in the store; `rental_points` is 3 rows.
- No new sync-path coupling — nothing to break in the Bokun importer.

Tradeoff accepted: matching isn't queryable in SQL, so we can't push it into a DB filter or RLS. Not needed — rental staff already read shifts broadly. If later we want server-side filtering or reporting on it, add the column then as a cached denormalisation (generated at sync + nightly re-match), keeping this helper as the single source of truth.

Explicitly **not** touching `rental_point_id`, so the `.filter((r) => !r.rental_point_id)` hide-from-main-calendar behaviour in `shifts-store.tsx` is untouched: matched guided tours keep showing on the main admin/guide calendar *and* additionally appear under the rental point.

## 4. Unmatched tours

Safe default: a tour that doesn't confidently match shows under **no** rental point (and continues to behave exactly as today everywhere else). Never guess.

Admin visibility for fixing them: an "Unmatched meeting points" collapsible on the Rental points page (admin only) listing upcoming shifts whose meeting point is non-empty, non-`TBD`, and matched nothing — grouped by distinct meeting-point string with a count. That immediately surfaces cases like Viale Aventino, and the fix is either editing the shift's meeting point or adding/renaming a rental point.

## 5. Retroactive?

Retroactive automatically, since it's computed at render time from data already present — nothing to backfill and nothing to undo. Rental staff will see today/upcoming tours at their point straight away.

## Technical notes

- New: `src/lib/rental-point-match.ts` — normaliser + `matchRentalPointByMeetingPoint()` + `buildRentalPointKeys()`, unit-testable pure functions.
- `src/components/rental-staff-panel.tsx` / rental-point calendar: include shifts where `rental_point_id === pointId` **or** the meeting-point match resolves to `pointId`.
- `src/components/all-rental-points-view.tsx`: same union when bucketing bookings per point; keep the existing no-PII rule.
- Matched-by-meeting-point tours get a subtle marker (e.g. "tour" vs rental) so rental staff can tell a guided departure from a bike rental.
- No migration, no changes to `src/lib/shifts-store.tsx` filtering, no changes to the Bokun import path.
