/**
 * Bokun dumps a booking's operational notes as one unbroken blob with literal
 * `--- Section: ---` dividers and a run-on "Key : Value Key : Value" tail for
 * the booking questions, e.g.
 *
 *   --- Inclusions: --- Private transportation Helmet Lock Wheel Pump Baby
 *   Seat up to 20kg Recommended Itineraries --- Questions and answers: ---
 *   Passenger Heights : 6'2 Date of Birth : 02211969 Viator amount: EUR 10.08
 *
 * Rental staff actually need the passenger heights (bike sizing) and any
 * child-seat requirement at a glance, so this parses the blob into labeled
 * sections plus highlighted key/value pairs for rendering.
 *
 * This is deliberately separate from cleanNoteText() in ./notes-format, which
 * only unwraps a double-JSON-encoding bug and is used elsewhere for that.
 */

export type BokunNoteField = { label: string; value: string };
export type BokunNoteSection = { label: string | null; text: string; fields: BokunNoteField[] };
export type ParsedBokunNotes = {
  /** Fields staff need at a glance (passenger heights, date of birth). */
  highlights: BokunNoteField[];
  sections: BokunNoteSection[];
};

const HIGHLIGHT_KEYS = /^(passenger heights?|heights?|date of birth|dob|birth date)$/i;
/** Noise we don't want to surface to staff. */
const DROP_KEYS = /^(viator amount|net amount|commission|reseller|affiliate)/i;

/** `Key : Value` pairs run together on one line; split at each key. */
function extractFields(text: string): { fields: BokunNoteField[]; rest: string } {
  const fields: BokunNoteField[] = [];
  const keyRe = /(^|\s)([A-Za-z][A-Za-z'’/&()\- ]{2,40}?)\s*:\s+/g;
  const marks: Array<{ start: number; keyStart: number; valueStart: number; key: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(text))) {
    const keyStart = m.index + m[1].length;
    marks.push({ start: m.index, keyStart, valueStart: keyRe.lastIndex, key: m[2].trim() });
  }
  if (!marks.length) return { fields: [], rest: text.trim() };

  const rest = text.slice(0, marks[0].keyStart).trim();
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].keyStart : text.length;
    const value = text.slice(mark.valueStart, end).trim();
    if (!value || DROP_KEYS.test(mark.key)) return;
    fields.push({ label: mark.key, value });
  });
  return { fields, rest };
}

function titleCaseLabel(raw: string): string {
  const s = raw.replace(/:\s*$/, "").trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseBokunNotes(raw: string | null | undefined): ParsedBokunNotes | null {
  if (!raw) return null;
  const text = raw.replace(/\r/g, "").trim();
  if (!text) return null;

  // Split on `--- Label: ---` dividers, keeping the label. Bokun also inlines a
  // few section headings without dividers, so promote those too.
  const withDividers = text.replace(
    /\s(Recommended Itineraries|Inclusions|Exclusions|What to bring)\s*:?\s/gi,
    (_m, label) => ` --- ${label}: --- `,
  );
  const parts = withDividers.split(/-{2,}\s*([^-]{1,60}?)\s*-{2,}/g);
  const chunks: Array<{ label: string | null; body: string }> = [];
  if (parts[0]?.trim()) chunks.push({ label: null, body: parts[0] });
  for (let i = 1; i < parts.length; i += 2) {
    chunks.push({ label: titleCaseLabel(parts[i] ?? ""), body: parts[i + 1] ?? "" });
  }
  if (!chunks.length) chunks.push({ label: null, body: text });


  const highlights: BokunNoteField[] = [];
  const sections: BokunNoteSection[] = [];

  for (const chunk of chunks) {
    const body = chunk.body.replace(/\s+/g, " ").trim();
    if (!body && !chunk.label) continue;
    const { fields, rest } = extractFields(body);
    const kept: BokunNoteField[] = [];
    for (const f of fields) {
      if (HIGHLIGHT_KEYS.test(f.label)) highlights.push(f);
      else kept.push(f);
    }
    if (!rest && !kept.length && !highlights.length) continue;
    if (!rest && !kept.length) continue;
    sections.push({ label: chunk.label, text: rest, fields: kept });
  }

  if (!highlights.length && !sections.length) return null;
  return { highlights, sections };
}
