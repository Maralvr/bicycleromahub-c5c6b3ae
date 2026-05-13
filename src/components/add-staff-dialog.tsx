import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Staff } from "@/lib/mock-data";
import type { NewStaffInput } from "@/lib/staff-store";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: NewStaffInput) => Promise<Staff | null> | void;
};

export function AddStaffDialog({ open, onOpenChange, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Staff["role"]>("guide");
  const [languages, setLanguages] = useState("");
  const [tags, setTags] = useState("");
  const [licenses, setLicenses] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName(""); setEmail(""); setPhone(""); setRole("guide");
    setLanguages(""); setTags(""); setLicenses("");
  };

  const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role,
        languages: csv(languages),
        tags: csv(tags),
        licenses: csv(licenses),
      });
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add staff member</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Staff["role"])}>
              <SelectTrigger id="role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="guide">Guide</SelectItem>
                <SelectItem value="rental">Rental</SelectItem>
                <SelectItem value="mechanic">Mechanic</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lang">Languages (comma separated)</Label>
            <Input id="lang" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="EN, IT, ES" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tags">Tags (comma separated)</Label>
            <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ebike, vatican" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lic">Licenses (comma separated)</Label>
            <Input id="lic" value={licenses} onChange={(e) => setLicenses(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Creates a directory entry. To grant login access, the person must sign up with the same email.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Add staff"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
