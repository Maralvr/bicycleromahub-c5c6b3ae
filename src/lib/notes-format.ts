/**
 * shifts.notes (and similar free-text note fields synced from Bokun) is
 * sometimes populated from a booking's raw notes array, but when Bokun
 * returns that array already serialized to a JSON string (rather than a
 * real array in the parsed payload), the importer's textValue() saw
 * `typeof value === "string"` and stored the raw JSON text verbatim, e.g.
 *   '[{"author":"info@bicycl-e.com","body":"PARTENZA ORE 13:30",
 *      "type":"OPERATIONS","sentAsEmail":false,"voucherAttached":false,
 *      "voucherPricesShown":false}]'
 * which then rendered as-is everywhere a shift's notes are shown (shift
 * cards, live shifts, the rental staff "My rental days" page, etc).
 *
 * This extracts just the human-readable body/message text if a note looks
 * like one of these serialized note-object arrays, and otherwise returns
 * the original text untouched. Used both by the Bokun import mapper (to
 * stop writing bad data going forward) and by every UI that displays a
 * shift's notes (so already-synced rows with this shape still render
 * cleanly without needing a re-sync/backfill).
 */
export function cleanNoteText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed[0] !== "[" && trimmed[0] !== "{") return raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return raw;
  }

  const extractBody = (item: unknown): string | null => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object" && typeof (item as { body?: unknown }).body === "string") {
      return (item as { body: string }).body;
    }
    return null;
  };

  if (Array.isArray(parsed)) {
    const bodies = parsed.map(extractBody).filter((b): b is string => !!b);
    if (bodies.length) return bodies.join("\n\n");
    // An empty (or body-less) parsed array means "no notes" -- returning the
    // raw text here used to render a literal "[]" in the UI.
    return parsed.length === 0 ? null : raw;
  }

  return extractBody(parsed) ?? raw;
}
