import { createFileRoute } from "@tanstack/react-router";
import { cleanNoteText } from "@/lib/notes-format";
import { parseBokunNotes } from "@/lib/bokun-notes-format";

export const Route = createFileRoute("/tmp-notes-preview")({
  component: Page,
  head: () => ({ meta: [{ title: "Notes preview" }] }),
});

const RAW =
  "--- Inclusions: --- Private transportation Helmet Lock Wheel Pump Baby Seat up to 20kg Recommended Itineraries --- Questions and answers: --- Passenger Heights : 6'2 Date of Birth : 02211969 Viator amount: EUR 10.08";

function Page() {
  const parsed = parseBokunNotes(cleanNoteText(RAW));
  return (
    <div className="p-6 max-w-xl space-y-4">
      <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 border border-border/30">
        📝 {RAW}
      </div>
      <div
        id="cleaned"
        className="text-xs text-muted-foreground bg-muted/40 rounded p-2 border border-border/30 space-y-1.5"
      >
        {parsed?.highlights.length ? (
          <div className="flex flex-wrap gap-1.5">
            {parsed.highlights.map((f) => (
              <span
                key={f.label}
                className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
              >
                {f.label}: {f.value}
              </span>
            ))}
          </div>
        ) : null}
        {parsed?.sections.map((s, i) => (
          <div key={i}>
            {s.label ? (
              <div className="font-semibold uppercase tracking-wide text-[10px] text-foreground/70">
                {s.label}
              </div>
            ) : null}
            {s.text && <div className="whitespace-pre-line">{s.text}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
