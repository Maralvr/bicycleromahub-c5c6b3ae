import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { ShiftsCalendar } from "@/components/shifts-calendar";

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

  const onTabChange = (t: RentalTab) =>
    navigate({ search: (prev: { point?: string; tab?: RentalTab }) => ({ ...prev, tab: t }), replace: true });

  return (
    <AppShell>
      {activePoint ? (
        <>
          <PageHeader
            title={activePoint.name}
            subtitle={activePoint.address ?? "Rental bookings for this location."}
            actions={
              <Button
                variant="outline"
                onClick={() =>
                  navigate({ search: { point: undefined, tab: undefined }, replace: true })
                }
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> All rental points
              </Button>
            }
          />
          <RentalBookingsView
            points={points}
            pointId={activePoint.id}
            tab={search.tab ?? "calendar"}
            onTabChange={onTabChange}
          />
        </>
      ) : (
        <>
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
            <div className="flex flex-wrap gap-2">
              {points.map((p) => (
                <div
                  key={p.id}
                  className="group inline-flex items-center gap-1 rounded-full border border-border/60 bg-card hover:border-primary/40 hover:bg-accent/40 transition-colors pl-3 pr-1 py-1"
                >
                  <Link
                    to="/rental-points"
                    search={{ point: p.id, tab: "calendar" }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary"
                    title={p.address ?? p.name}
                  >
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {p.name}
                    {!p.active && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">(inactive)</span>
                    )}
                  </Link>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setEditing(p)}
                    aria-label="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setConfirmDelete(p)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {points.length > 0 && (
            <RentalBookingsView
              points={points}
              pointId={null}
              tab={search.tab ?? "calendar"}
              onTabChange={onTabChange}
            />
          )}
        </>
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

function RentalBookingsView({
  points,
  pointId,
  tab,
  onTabChange,
}: {
  points: RentalPoint[];
  pointId: string | null;
  tab: RentalTab;
  onTabChange: (t: RentalTab) => void;
}) {
  const { shifts, loading, updateShift, assignShift } = useRentalShifts();
  const { staff } = useStaffStore();

  const scoped = useMemo(
    () => (pointId ? shifts.filter((s) => s.rentalPointId === pointId) : shifts),
    [shifts, pointId],
  );

  const handleAssign = async (shiftId: string, staffId: string) => {
    try {
      await assignShift(shiftId, staffId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign");
    }
  };

  const handleUpdateDeparture = async (
    shiftId: string,
    patch: {
      startTime?: string;
      endTime?: string;
      meetingPoint?: string;
      rate?: number | null;
      rateTitle?: string | null;
    },
  ) => {
    try {
      await updateShift(shiftId, patch);
      toast.success("Booking updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  };

  return (
    <div className="mt-8">
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as RentalTab)}>
        <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-foreground">
            {pointId ? "Bookings" : "Rental bookings"}
          </h2>
          <TabsList>
            <TabsTrigger value="calendar">
              <CalendarDays className="h-4 w-4 mr-1" /> Calendar
            </TabsTrigger>
            <TabsTrigger value="list">
              <ListIcon className="h-4 w-4 mr-1" /> List
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="calendar" className="mt-0">
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
          ) : scoped.length === 0 ? (
            <Card className="p-6 border-dashed text-sm text-muted-foreground text-center">
              No rental bookings.
            </Card>
          ) : (
            <ShiftsCalendar
              shifts={scoped}
              staff={staff}
              onAssign={handleAssign}
              onUpdateDeparture={handleUpdateDeparture}
            />
          )}
        </TabsContent>

        <TabsContent value="list" className="mt-0">
          <RentalBookingsList rows={scoped} points={points} loading={loading} pointId={pointId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RentalBookingsList({
  rows,
  points,
  loading,
  pointId,
}: {
  rows: RentalShift[];
  points: RentalPoint[];
  loading: boolean;
  pointId: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = useMemo(() => rows.filter((r) => r.date >= today), [rows, today]);

  const byPoint = useMemo(() => {
    const map = new Map<string, RentalShift[]>();
    for (const r of upcoming) {
      const key = r.rentalPointId ?? "__none__";
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return map;
  }, [upcoming]);

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>;
  }

  if (upcoming.length === 0) {
    return (
      <Card className="p-6 border-dashed text-sm text-muted-foreground text-center">
        No upcoming rental bookings.
      </Card>
    );
  }

  const renderRow = (s: RentalShift) => {
    const pax = (s.participants?.adults ?? 0) + (s.participants?.teens ?? 0) + (s.participants?.infants ?? 0);
    return (
      <div key={s.id} className="p-3 grid grid-cols-12 gap-3 items-center text-sm">
        <div className="col-span-4 sm:col-span-2 font-medium text-foreground">
          {s.date} · {s.startTime}
        </div>
        <div className="col-span-8 sm:col-span-5 min-w-0">
          <div className="truncate text-foreground">{s.tourName}</div>
          {s.rateTitle && (
            <div className="text-xs text-muted-foreground truncate">{s.rateTitle}</div>
          )}
        </div>
        <div className="col-span-7 sm:col-span-3 min-w-0">
          <div className="truncate">{s.customer?.name ?? "—"}</div>
          {s.customer?.phone && (
            <div className="text-xs text-muted-foreground truncate">{s.customer.phone}</div>
          )}
        </div>
        <div className="col-span-2 sm:col-span-1 text-right text-muted-foreground flex items-center justify-end gap-1">
          <Users className="h-3 w-3" /> {pax}
        </div>
        <div className="col-span-3 sm:col-span-1 text-right text-xs text-muted-foreground truncate">
          {s.bookingId ?? ""}
        </div>
      </div>
    );
  };

  if (pointId) {
    return <Card className="divide-y divide-border/60 overflow-hidden">{upcoming.map(renderRow)}</Card>;
  }

  const rentalPoints = points.filter((p) => byPoint.has(p.id));
  return (
    <div className="space-y-6">
      {rentalPoints.map((p) => {
        const list = byPoint.get(p.id) ?? [];
        return (
          <div key={p.id}>
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-4 w-4 text-primary" />
              <Link
                to="/rental-points"
                search={{ point: p.id, tab: "list" }}
                className="font-semibold text-foreground hover:text-primary"
              >
                {p.name}
              </Link>
              <Badge variant="secondary" className="ml-1">{list.length}</Badge>
            </div>
            <Card className="divide-y divide-border/60 overflow-hidden">{list.map(renderRow)}</Card>
          </div>
        );
      })}
    </div>
  );
}

