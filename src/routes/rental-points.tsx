import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { MapPin, Phone, Clock, Plus, Pencil, Trash2, CalendarDays, List as ListIcon, ArrowLeft, Users } from "lucide-react";
import { toast } from "sonner";
import { useRentalPoints, RentalPoint, RentalPointInput } from "@/lib/rental-points";
import { useRequireAdmin } from "@/lib/require-admin";
import { useRentalShifts, type RentalShift } from "@/lib/rental-shifts";
import { useStaffStore } from "@/lib/staff-store";
import { ShiftsCalendar, type CalendarShift } from "@/components/shifts-calendar";

type RentalTab = "calendar" | "list";

export const Route = createFileRoute("/rental-points")({
  validateSearch: (search: Record<string, unknown>): { point?: string; tab?: RentalTab } => {
    const tab = search.tab as string | undefined;
    const point = search.point as string | undefined;
    return {
      point: typeof point === "string" && point.length > 0 ? point : undefined,
      tab: tab === "calendar" || tab === "list" ? tab : undefined,
    };
  },
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
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [editing, setEditing] = useState<RentalPoint | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RentalPoint | null>(null);
  const activePoint = useMemo(
    () => (search.point ? points.find((p) => p.id === search.point) ?? null : null),
    [points, search.point],
  );
  if (!ready) return null;

  if (activePoint) {
    return (
      <AppShell>
        <PageHeader
          title={activePoint.name}
          subtitle={activePoint.address ?? "Rental bookings for this location."}
          actions={
            <Button
              variant="outline"
              onClick={() => navigate({ search: { point: undefined, tab: undefined }, replace: true })}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> All rental points
            </Button>
          }
        />
        <RentalBookingsView
          points={points}
          pointId={activePoint.id}
          tab={search.tab ?? "calendar"}
          onTabChange={(t) =>
            navigate({ search: (prev) => ({ ...prev, tab: t }), replace: true })
          }
        />
        <Footer
          creating={creating}
          editing={editing}
          confirmDelete={confirmDelete}
          setCreating={setCreating}
          setEditing={setEditing}
          setConfirmDelete={setConfirmDelete}
          create={create}
          update={update}
          remove={remove}
        />
      </AppShell>
    );
  }

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
                  <Link
                    to="/rental-points"
                    search={{ point: p.id, tab: "calendar" }}
                    className="font-semibold text-foreground truncate hover:text-primary block"
                  >
                    {p.name}
                  </Link>
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
                <Button size="sm" asChild className="flex-1">
                  <Link to="/rental-points" search={{ point: p.id, tab: "calendar" }}>
                    <CalendarDays className="h-3 w-3 mr-1" /> View bookings
                  </Link>
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                  <Pencil className="h-3 w-3" />
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

      {points.length > 0 && (
        <RentalBookingsView
          points={points}
          pointId={null}
          tab={search.tab ?? "calendar"}
          onTabChange={(t) =>
            navigate({ search: (prev) => ({ ...prev, tab: t }), replace: true })
          }
        />
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

type RentalShift = {
  id: string;
  rental_point_id: string | null;
  tour_name: string;
  booking_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  customer_name: string | null;
  customer_phone: string | null;
  adults: number;
  teens: number;
  infants: number;
  rate_title: string | null;
};

function RentalBookingsByLocation({ points }: { points: RentalPoint[] }) {
  const [rows, setRows] = useState<RentalShift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("shifts")
        .select(
          "id, rental_point_id, tour_name, booking_id, date, start_time, end_time, customer_name, customer_phone, adults, teens, infants, rate_title",
        )
        .not("rental_point_id", "is", null)
        .gte("date", today)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });
      if (active) {
        setRows((data ?? []) as RentalShift[]);
        setLoading(false);
      }
    };
    void load();
    const channel = supabase
      .channel(`rental-bookings-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => void load())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const byPoint = useMemo(() => {
    const map = new Map<string, RentalShift[]>();
    for (const r of rows) {
      if (!r.rental_point_id) continue;
      const arr = map.get(r.rental_point_id) ?? [];
      arr.push(r);
      map.set(r.rental_point_id, arr);
    }
    return map;
  }, [rows]);

  const rentalPoints = points.filter((p) => byPoint.has(p.id));

  return (
    <div className="mt-10">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold text-foreground">Rentals by location</h2>
        <span className="text-xs text-muted-foreground">
          {loading ? "Loading…" : `${rows.length} upcoming`}
        </span>
      </div>
      {!loading && rentalPoints.length === 0 ? (
        <Card className="p-6 border-dashed text-sm text-muted-foreground text-center">
          No upcoming rental bookings.
        </Card>
      ) : (
        <div className="space-y-6">
          {rentalPoints.map((p) => {
            const list = byPoint.get(p.id) ?? [];
            return (
              <div key={p.id}>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-foreground">{p.name}</h3>
                  <Badge variant="secondary" className="ml-1">{list.length}</Badge>
                </div>
                <Card className="divide-y divide-border/60 overflow-hidden">
                  {list.map((s) => {
                    const pax = s.adults + s.teens + s.infants;
                    return (
                      <div key={s.id} className="p-3 grid grid-cols-12 gap-3 items-center text-sm">
                        <div className="col-span-3 sm:col-span-2 font-medium text-foreground">
                          {s.date} · {s.start_time.slice(0, 5)}
                        </div>
                        <div className="col-span-5 sm:col-span-5 min-w-0">
                          <div className="truncate text-foreground">{s.tour_name}</div>
                          {s.rate_title && (
                            <div className="text-xs text-muted-foreground truncate">{s.rate_title}</div>
                          )}
                        </div>
                        <div className="col-span-3 sm:col-span-3 min-w-0">
                          <div className="truncate">{s.customer_name ?? "—"}</div>
                          {s.customer_phone && (
                            <div className="text-xs text-muted-foreground truncate">{s.customer_phone}</div>
                          )}
                        </div>
                        <div className="col-span-1 sm:col-span-1 text-right text-muted-foreground">
                          {pax} pax
                        </div>
                        <div className="hidden sm:block sm:col-span-1 text-right text-xs text-muted-foreground">
                          {s.booking_id ?? ""}
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
