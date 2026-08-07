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
/**
 * A Bokun booking carries three separate note fields ("Note for booking",
 * "Note to appear on finance reports", "Note to appear on operations"), which
 * come back in the notes array tagged as GENERAL / FINANCE / OPERATIONS.
 * Guides and rental staff only need the operations note, so whenever the array
 * carries type tags we keep OPERATIONS entries only (and drop the rest).
 * Untagged notes are kept as-is for backwards compatibility.
 */
const OPERATIONS_TYPE = /^operations?$/i;

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

  const noteType = (item: unknown): string | null => {
    if (item && typeof item === "object" && typeof (item as { type?: unknown }).type === "string") {
      return (item as { type: string }).type;
    }
    return null;
  };

  if (Array.isArray(parsed)) {
    const typed = parsed.filter((item) => noteType(item) !== null);
    const source = typed.length ? typed.filter((item) => OPERATIONS_TYPE.test(noteType(item) ?? "")) : parsed;
    const bodies = source.map(extractBody).filter((b): b is string => !!b);
    if (bodies.length) return bodies.join("\n\n");
    // An empty (or body-less) parsed array means "no notes" -- returning the
    // raw text here used to render a literal "[]" in the UI. Same when the
    // booking only had GENERAL/FINANCE notes: nothing operational to show.
    return parsed.length === 0 || typed.length ? null : raw;
  }

  if (parsed && typeof parsed === "object") {
    const type = noteType(parsed);
    if (type && !OPERATIONS_TYPE.test(type)) return null;
  }

  return extractBody(parsed) ?? raw;
}

