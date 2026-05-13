import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MapPin, Phone, Clock, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRentalPoints, RentalPoint, RentalPointInput } from "@/lib/rental-points";
import { useRequireAdmin } from "@/lib/require-admin";

export const Route = createFileRoute("/rental-points")({
  head: () => ({
    meta: [
      { title: "Rental points — Bicycle Roma" },
      { name: "description", content: "Manage bike rental pickup and return locations." },
    ],
  }),
  component: RentalPointsPage,
});

function RentalPointsPage() {
  const { ready } = useRequireAdmin();
  const { points, loading, error, create, update, remove } = useRentalPoints();
  const [editing, setEditing] = useState<RentalPoint | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RentalPoint | null>(null);
  if (!ready) return null;

  return (
    <AppShell>
      <PageHeader
        title="Rental points"
        subtitle="Pickup & return locations across Rome."
        actions={
          <Button onClick={() => setCreating(true)} className="shadow-[var(--shadow-elegant)]">
            <Plus className="h-4 w-4 mr-1" /> Add point
          </Button>
        }
      />

      {error && (
        <Card className="p-4 mb-4 border-destructive/40 bg-destructive/5 text-sm text-destructive">
          {error}
        </Card>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : points.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <MapPin className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" />
          <h3 className="font-semibold text-foreground">No rental points yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Add your first pickup location to get started.
          </p>
          <Button onClick={() => setCreating(true)} className="mt-4">
            <Plus className="h-4 w-4 mr-1" /> Add point
          </Button>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {points.map((p) => (
            <Card key={p.id} className="p-5 border-border/60 hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground truncate">{p.name}</h3>
                  {p.city && <div className="text-xs text-muted-foreground">{p.city}</div>}
                </div>
                {p.active ? (
                  <Badge variant="secondary" className="bg-success/15 text-success border-0">Active</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                )}
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {p.address && (
                  <div className="flex items-start gap-1.5">
                    <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="text-foreground/80">{p.address}</span>
                  </div>
                )}
                {p.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 flex-shrink-0" />
                    <a href={`tel:${p.phone}`} className="hover:text-primary">{p.phone}</a>
                  </div>
                )}
                {p.opening_hours && (
                  <div className="flex items-start gap-1.5">
                    <Clock className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>{p.opening_hours}</span>
                  </div>
                )}
              </div>
              {p.notes && (
                <p className="text-xs text-muted-foreground/80 mt-3 pt-3 border-t border-border/60 italic">
                  {p.notes}
                </p>
              )}
              <div className="flex gap-2 mt-4 pt-3 border-t border-border/60">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(p)}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmDelete(p)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <RentalPointDialog
        open={creating || !!editing}
        initial={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSubmit={async (input) => {
          try {
            if (editing) {
              await update(editing.id, input);
              toast.success("Rental point updated");
            } else {
              await create(input);
              toast.success("Rental point added");
            }
            setCreating(false);
            setEditing(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to save");
          }
        }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rental point?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" will be permanently removed. Staff assignments to this point will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await remove(confirmDelete.id);
                  toast.success("Deleted");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to delete");
                }
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function RentalPointDialog({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: RentalPoint | null;
  onClose: () => void;
  onSubmit: (input: RentalPointInput) => Promise<void>;
}) {
  const emptyForm: RentalPointInput = {
    name: "",
    address: "",
    city: "Rome",
    phone: "",
    opening_hours: "",
    notes: "",
    active: true,
  };
  const [form, setForm] = useState<RentalPointInput>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              name: initial.name,
              address: initial.address ?? "",
              city: initial.city ?? "Rome",
              phone: initial.phone ?? "",
              opening_hours: initial.opening_hours ?? "",
              notes: initial.notes ?? "",
              active: initial.active,
            }
          : emptyForm,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit rental point" : "New rental point"}</DialogTitle>
          <DialogDescription>
            Pickup & return location for bikes.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.name.trim()) {
              toast.error("Name is required");
              return;
            }
            setSubmitting(true);
            await onSubmit({
              ...form,
              name: form.name.trim(),
              address: form.address?.trim() || null,
              city: form.city?.trim() || null,
              phone: form.phone?.trim() || null,
              opening_hours: form.opening_hours?.trim() || null,
              notes: form.notes?.trim() || null,
            });
            setSubmitting(false);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="rp-name">Name *</Label>
            <Input
              id="rp-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Trastevere shop"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rp-city">City</Label>
              <Input
                id="rp-city"
                value={form.city ?? ""}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-phone">Phone</Label>
              <Input
                id="rp-phone"
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+39 ..."
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-address">Address</Label>
            <Input
              id="rp-address"
              value={form.address ?? ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Via ..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-hours">Opening hours</Label>
            <Input
              id="rp-hours"
              value={form.opening_hours ?? ""}
              onChange={(e) => setForm({ ...form, opening_hours: e.target.value })}
              placeholder="Mon–Sun 09:00–19:00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-notes">Notes</Label>
            <Textarea
              id="rp-notes"
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="Anything staff should know about this location."
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
            <div>
              <Label htmlFor="rp-active" className="cursor-pointer">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive points are hidden from shift assignment.</p>
            </div>
            <Switch
              id="rp-active"
              checked={form.active ?? true}
              onCheckedChange={(v) => setForm({ ...form, active: v })}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : initial ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
