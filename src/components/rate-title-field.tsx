import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PUBLIC_TOUR_LANGUAGES, isPublicTour } from "@/lib/tour-languages";

type Props = {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
};

/**
 * Dropdown for public-tour language/rate name so bookings with the same
 * tour/date/time/language group together on the calendar.
 * Falls back to a free-text input for private tours.
 * If the current value isn't in the canonical list, it's added so admins
 * don't accidentally lose legacy values.
 */
export function RateTitleField({ id, value, onChange, className }: Props) {
  const v = (value ?? "").trim();
  if (!isPublicTour(v)) {
    return (
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Private tour"
        className={className}
      />
    );
  }

  const options = Array.from(
    new Set<string>([...(PUBLIC_TOUR_LANGUAGES as readonly string[]), ...(v ? [v] : [])]),
  );

  return (
    <Select value={v} onValueChange={(val) => onChange(val)}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder="Select tour language" />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
