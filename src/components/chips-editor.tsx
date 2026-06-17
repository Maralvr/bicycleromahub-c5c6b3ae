import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const MAX_ITEM_LEN = 30;
const MAX_ITEMS = 12;

export function ChipsEditor({
  label,
  icon: Icon,
  values,
  onChange,
  suggestions,
  placeholder,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  values: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const v = raw.trim().slice(0, MAX_ITEM_LEN);
    if (!v) return;
    if (values.length >= MAX_ITEMS) {
      toast.error(`Max ${MAX_ITEMS} items`);
      return;
    }
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...values, v]);
    setDraft("");
  };

  const remove = (v: string) => onChange(values.filter((x) => x !== v));
  const remaining = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));

  return (
    <div>
      <Label className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}
      </Label>
      <div className="flex flex-wrap gap-1.5 p-2 min-h-[44px] rounded-md border border-input bg-background">
        {values.length === 0 && (
          <span className="text-xs text-muted-foreground italic px-1 self-center">None yet — add one below.</span>
        )}
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="font-normal text-xs gap-1 pl-2 pr-1 py-0.5 bg-primary/10 text-foreground border-0">
            {v}
            <button
              type="button"
              onClick={() => remove(v)}
              className="rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder={placeholder}
          maxLength={MAX_ITEM_LEN}
          className="h-9 text-sm"
        />
        <Button type="button" size="sm" variant="outline" onClick={() => add(draft)} className="h-9">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
      {remaining.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1 self-center">
            Quick add:
          </span>
          {remaining.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-border hover:border-primary hover:bg-primary/5 hover:text-primary transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
