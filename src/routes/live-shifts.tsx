import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader, StatusPill } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Plus, Clock, MapPin, Users, Euro, Pencil, Trash2, ExternalLink, UserCheck, Webhook } from "lucide-react";
import { toast } from "sonner";
import { useLiveShifts, type LiveShift } from "@/lib/live-shifts";
import { useRentalPoints } from "@/lib/rental-points";
import { useLiveStaff } from "@/lib/live-staff";
import { ShiftDialog } from "@/components/shift-dialog";

const BOKUN_WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bokun-webhook`;

const ALL = "__all";

export const Route = createFileRoute("/live-shifts")({
  head: () => ({
    meta: [
      { title: "Live shifts — eBicycle Roma" },
      { name: "description", content: "Real-time shifts synced from the database, filtered by rental point." },
    ],
  }),
  component: LiveShiftsPage,
});

function LiveShiftsPage() {
  const [pointFilter, setPointFilter] = useState<string>(ALL);
  const { points } = useRentalPoints();
  const { staff } = useLiveStaff();
  const { shifts, loading, error, create, update, remove, refresh } = useLiveShifts({
    rentalPointId: pointFilter === ALL ? null : pointFilter,
  });

  const [editing, setEditing] = useState<LiveShift | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<LiveShift | null>(null);

  const pointById = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = shifts.filter((s) => s.date >= todayStr);
  const past = shifts.filter((s) => s.date < todayStr);

  return (
    <AppShell>
      <PageHeader
        title="Live shifts"
        subtitle="Real-time bookings from the database. Manual + Bokun-synced."
        actions={
          <>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const startISO = new Date(Date.now() + 86400000).toISOString().replace(/T.*/, "T10:00:00.000Z");
                  const res = await fetch(BOKUN_WEBHOOK_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      bookingId: Math.floor(Math.random() * 100000),
                      confirmationCode: `BKN-${Date.now()}`,
                      productTitle: "Colosseum & Roman Forum E-Bike Tour",
                      startDateTime: startISO,
                      durationMinutes: 180,
                      pickupPlace: { title: "Piazza Venezia, Rome" },
                      customer: { fullName: "Test Booking", phoneNumber: "+39 000 000 0000" },
                      pricingCategoryBookings: [{ pricingCategory: { title: "Adult" }, quantity: 4 }],
                      totalPrice: 240,
                    }),
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
                  toast.success(`Bokun booking ${json.action}`, { description: "Live shifts refreshed." });
                  await refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Webhook failed");
                }
              }}
            >
              <Webhook className="h-4 w-4 mr-1" /> Simulate Bokun
            </Button>
            <Button onClick={() => setCreating(true)} className="shadow-[var(--shadow-elegant)]">
              <Plus className="h-4 w-4 mr-1" /> New shift
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Location</span>
          <Select value={pointFilter} onValueChange={setPointFilter}>
            <SelectTrigger className="h-9 w-56 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All locations</SelectItem>
              {points.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <Card className="p-4 mb-4 border-destructive/40 bg-destructive/5 text-sm text-destructive">{error}</Card>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : shifts.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <Clock className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" />
          <h3 className="font-semibold text-foreground">No shifts yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create one manually or wait for a Bokun booking to land.</p>
          <Button onClick={() => setCreating(true)} className="mt-4">
            <Plus className="h-4 w-4 mr-1" /> New shift
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          <Section title="Upcoming" shifts={upcoming} pointById={pointById} staffById={staffById} onEdit={setEditing} onDelete={setConfirmDelete} />
          {past.length > 0 && <Section title="Past" shifts={past} pointById={pointById} staffById={staffById} onEdit={setEditing} onDelete={setConfirmDelete} muted />}
        </div>
      )}

      <ShiftDialog
        open={creating || !!editing}
        initial={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSubmit={async (input) => {
          if (editing) {
            await update(editing.id, input);
            toast.success("Shift updated");
          } else {
            await create(input);
            toast.success("Shift created");
          }
          await refresh();
        }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shift?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.tour_name}" on {confirmDelete?.date} will be removed. This cannot be undone.
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

function Section({
  title,
  shifts,
  pointById,
  staffById,
  onEdit,
  onDelete,
  muted,
}: {
  title: string;
  shifts: LiveShift[];
  pointById: Map<string, { name: string; address: string | null }>;
  staffById: Map<string, { name: string; avatar: string }>;
  onEdit: (s: LiveShift) => void;
  onDelete: (s: LiveShift) => void;
  muted?: boolean;
}) {
  if (shifts.length === 0) return null;
  return (
    <div>
      <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${muted ? "text-muted-foreground" : "text-foreground"}`}>
        {title} <span className="text-muted-foreground font-normal">({shifts.length})</span>
      </h2>
      <div className="grid gap-3">
        {shifts.map((s) => {
          const point = s.rental_point_id ? pointById.get(s.rental_point_id) : null;
          const guide = s.assigned_staff_id ? staffById.get(s.assigned_staff_id) : null;
          const totalPax = s.participants_adults + s.participants_teens + s.participants_infants;
          return (
            <Card key={s.id} className={`p-0 overflow-hidden border-border/60 hover:shadow-[var(--shadow-card)] transition-all ${muted ? "opacity-70" : ""}`}>
              <div className="flex flex-col lg:flex-row">
                <div className="lg:w-36 p-4 bg-gradient-to-br from-muted/40 to-transparent lg:border-r border-border/60 flex lg:flex-col items-center lg:items-start gap-3 lg:gap-1.5 justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">{s.date}</div>
                    <div className="text-2xl font-bold text-foreground flex items-center gap-1.5 mt-0.5">
                      <Clock className="h-4 w-4 text-primary" />
                      {s.start_time.slice(0, 5)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">→ {s.end_time.slice(0, 5)}</div>
                  </div>
                  <Badge variant={s.source === "bokun" ? "default" : "outline"} className={`text-[9px] uppercase tracking-wider font-bold ${s.source === "bokun" ? "bg-secondary text-secondary-foreground" : ""}`}>
                    {s.source}
                  </Badge>
                </div>

                <div className="flex-1 min-w-0 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground text-[15px] leading-tight">{s.tour_name}</h3>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
                        {point && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {point.name}
                          </span>
                        )}
                        {s.meeting_point && <span className="text-muted-foreground/80">· {s.meeting_point}</span>}
                        {s.booking_id && (
                          <span className="flex items-center gap-1"><ExternalLink className="h-3 w-3" />{s.booking_id}</span>
                        )}
                      </div>
                    </div>
                    <StatusPill status={s.status} />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
                    {s.customer_name && (
                      <div>
                        <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">Customer</div>
                        <div className="font-semibold text-foreground mt-0.5 truncate">{s.customer_name}</div>
                        {s.customer_phone && <div className="text-muted-foreground truncate">{s.customer_phone}</div>}
                      </div>
                    )}
                    {totalPax > 0 && (
                      <div>
                        <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1"><Users className="h-2.5 w-2.5" /> Pax</div>
                        <div className="font-semibold text-foreground mt-0.5">
                          {totalPax}
                          <span className="text-muted-foreground font-normal text-[10px] ml-1">
                            ({s.participants_adults}a{s.participants_teens > 0 ? ` ${s.participants_teens}t` : ""}{s.participants_infants > 0 ? ` ${s.participants_infants}i` : ""})
                          </span>
                        </div>
                      </div>
                    )}
                    {s.rate !== null && (
                      <div>
                        <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">Rate</div>
                        <div className="font-semibold text-foreground mt-0.5 flex items-center gap-0.5"><Euro className="h-3 w-3" />{s.rate}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1"><UserCheck className="h-2.5 w-2.5" /> Guide</div>
                      <div className="font-semibold text-foreground mt-0.5 truncate">{guide?.name ?? <span className="text-muted-foreground font-normal italic">Unassigned</span>}</div>
                    </div>
                  </div>

                  {s.required_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {s.required_tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="font-normal text-[10px] bg-primary/10 text-foreground border-0">{tag}</Badge>
                      ))}
                    </div>
                  )}

                  {s.notes && <div className="mt-3 text-xs text-foreground/70 italic">📝 {s.notes}</div>}

                  <div className="flex gap-2 mt-3 pt-3 border-t border-border/60">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onEdit(s)}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onDelete(s)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
