import { useEffect, useState } from "react";
import { X, Plus, Phone, Languages as LangIcon, Award, Tag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Staff } from "@/lib/mock-data";
import { useStaffStore } from "@/lib/staff-store";
import { toast } from "sonner";

const SUGGESTED_TAGS = ["e-bike", "vintage", "food-tour", "rental", "maintenance", "night-tour", "kids-friendly", "long-distance", "trailers", "VIP"];
const SUGGESTED_LANGS = ["English", "Italian", "Spanish", "French", "German", "Portuguese", "Mandarin"];
const SUGGESTED_LICENSES = ["Tour guide A", "Tour guide B", "Driver B", "First aid", "Mechanic L1", "Mechanic L2"];

const MAX_ITEM_LEN = 30;
const MAX_ITEMS = 12;

type Props = {
  staffMember: Staff;
  open: boolean;
  onClose: () => void;
};

export function EditProfileDialog({ staffMember, open, onClose }: Props) {
  const { updateProfile } = useStaffStore();
  const [phone, setPhone] = useState(staffMember.phone);
  const [tags, setTags] = useState<string[]>(staffMember.tags);
  const [languages, setLanguages] = useState<string[]>(staffMember.languages);
  const [licenses, setLicenses] = useState<string[]>(staffMember.licenses);

  // Reset when reopening for a different member
  useEffect(() => {
    if (open) {
      setPhone(staffMember.phone);
      setTags(staffMember.tags);
      setLanguages(staffMember.languages);
      setLicenses(staffMember.licenses);
    }
  }, [open, staffMember]);

  const handleSave = () => {
    const cleanPhone = phone.trim().slice(0, 30);
    if (!cleanPhone) {
      toast.error("Phone cannot be empty");
      return;
    }
    updateProfile(staffMember.id, {
      phone: cleanPhone,
      tags,
      languages,
      licenses,
    });
    toast.success("Profile updated", { description: "Dispatch will use these for smart assignments." });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border/60">
          <DialogTitle>Edit my profile</DialogTitle>
          <DialogDescription>
            Keep your skills accurate so dispatch can assign you to the right tours.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <Label htmlFor="profile-phone" className="flex items-center gap-1.5 mb-1.5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" /> Phone
            </Label>
            <Input
              id="profile-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={30}
              placeholder="+39 …"
            />
          </div>

          <ChipsEditor
            label="Skills & tags"
            icon={Tag}
            values={tags}
            onChange={setTags}
            suggestions={SUGGESTED_TAGS}
            placeholder="Add a tag (e.g. food-tour)"
          />

          <ChipsEditor
            label="Languages"
            icon={LangIcon}
            values={languages}
            onChange={setLanguages}
            suggestions={SUGGESTED_LANGS}
            placeholder="Add a language"
          />

          <ChipsEditor
            label="Licenses & certifications"
            icon={Award}
            values={licenses}
            onChange={setLicenses}
            suggestions={SUGGESTED_LICENSES}
            placeholder="Add a license"
          />
        </div>

        <DialogFooter className="p-4 border-t border-border/60 bg-card flex-row justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChipsEditor({
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

  const remainingSuggestions = suggestions.filter(
    (s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()),
  );

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

      {remainingSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1 self-center">Quick add:</span>
          {remainingSuggestions.slice(0, 8).map((s) => (
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
