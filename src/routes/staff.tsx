import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader, StatusPill } from "@/components/page-header";
import { Avatar } from "@/components/avatar";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/current-user";
import { useStaffStore } from "@/lib/staff-store";
import { shifts as allShifts, Staff } from "@/lib/mock-data";
import { Plus, Search, CalendarOff, Phone, Languages as LangIcon, Award, CalendarDays, Briefcase, ChevronRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import { EditProfileDialog } from "@/components/edit-profile-dialog";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff — eBicycle Roma" },
      { name: "description", content: "Manage staff profiles, tags, languages and availability." },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  const { role } = useCurrentUser();
  return role === "staff" ? <MyAvailabilityView /> : <AdminStaffDirectory />;
}

/* ----------------------- STAFF — Personal availability ----------------------- */

function MyAvailabilityView() {
  const { t } = useI18n();
  const { staffId } = useCurrentUser();
  const { staff } = useStaffStore();
  const me = staff.find((s) => s.id === staffId) ?? staff[0];
  const [editOpen, setEditOpen] = useState(false);

  // Stats for "my month"
  const yearMonth = new Date().toISOString().slice(0, 7);
  const myShifts = allShifts.filter((s) => s.assignedStaffId === me.id && s.status !== "rejected");
  const monthShifts = myShifts.filter((s) => s.date.startsWith(yearMonth));
  const monthOffDays = me.unavailability.filter((u) => u.date.startsWith(yearMonth)).length;
  const acceptedHours = monthShifts
    .filter((s) => s.status === "accepted")
    .reduce((sum, s) => {
      const [sh, sm] = s.startTime.split(":").map(Number);
      const [eh, em] = s.endTime.split(":").map(Number);
      return sum + (eh * 60 + em - (sh * 60 + sm)) / 60;
    }, 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow={`Hi ${me.name.split(" ")[0]} 👋`}
        title="My availability"
        subtitle="Tap any day to mark yourself off, or set a partial-day busy window."
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={CalendarDays} label="Shifts this month" value={monthShifts.length} sub={`${acceptedHours.toFixed(1)} h accepted`} />
        <StatCard icon={Briefcase} label="Pending response" value={myShifts.filter((s) => s.status === "pending").length} sub="Accept or reject" />
        <StatCard icon={CalendarOff} label="Days off this month" value={monthOffDays} sub="Marked unavailable" />
        <StatCard
          icon={LangIcon}
          label="Status"
          value={me.status === "available" ? "Available" : me.status === "on_shift" ? "On shift" : "Off duty"}
          sub={me.status === "off" ? "Not on the clock" : "Visible to dispatch"}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Calendar — main */}
        <Card className="p-5 lg:col-span-2 border-border/60">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-semibold text-foreground">Monthly calendar</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Days with assigned shifts are locked. Click a free day to edit.</p>
            </div>
          </div>
          <AvailabilityCalendar staffMember={me} shifts={allShifts} />
        </Card>

        {/* Profile + skills */}
        <div className="space-y-4">
          <Card className="p-5 border-border/60">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={me.name} initials={me.avatar} size="lg" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{me.name}</h3>
                  <div className="text-xs text-muted-foreground capitalize">{me.role}</div>
                  <div className="mt-1.5"><StatusPill status={me.status} /></div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2.5 flex-shrink-0"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
            </div>

            <div className="space-y-3 text-xs">
              <ProfileRow icon={Phone} label={t.common.phone}>
                <a href={`tel:${me.phone}`} className="font-medium hover:text-primary">{me.phone}</a>
              </ProfileRow>
              <ProfileRow icon={LangIcon} label={t.common.languages}>
                <span className="font-medium">{me.languages.join(" · ") || "—"}</span>
              </ProfileRow>
              <ProfileRow icon={Award} label={t.common.licenses}>
                <span className="font-medium">{me.licenses.join(", ") || "—"}</span>
              </ProfileRow>
            </div>

            <div className="mt-4 pt-4 border-t border-border/60">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{t.common.tags}</div>
                <button
                  onClick={() => setEditOpen(true)}
                  className="text-[10px] font-semibold text-primary hover:underline"
                >
                  Manage →
                </button>
              </div>
              {me.tags.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No tags yet — add some so dispatch can match you to the right tours.</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {me.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="font-normal text-[10px] bg-primary/10 text-foreground border-0">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Upcoming shifts mini list */}
          <Card className="p-5 border-border/60">
            <h3 className="font-semibold text-foreground text-sm mb-3">Your next shifts</h3>
            {myShifts.length === 0 ? (
              <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">No upcoming shifts.</div>
            ) : (
              <div className="space-y-2">
                {myShifts.slice(0, 4).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/40 border border-border/40">
                    <div className="h-9 w-9 rounded-md bg-gradient-to-br from-primary to-primary-glow text-primary-foreground flex flex-col items-center justify-center flex-shrink-0">
                      <div className="text-[8px] uppercase opacity-80 leading-none">{new Date(s.date + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}</div>
                      <div className="text-xs font-bold leading-tight tabular-nums">{new Date(s.date + "T00:00:00").getDate()}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">{s.tourName}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">{s.startTime} → {s.endTime}</div>
                    </div>
                    <StatusPill status={s.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; sub: string }) {
  return (
    <Card className="p-4 border-border/60">
      <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-2xl font-bold text-foreground mt-1 tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </Card>
  );
}

function ProfileRow({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3 w-3" /> {label}</span>
      {children}
    </div>
  );
}

/* ------------------------------ ADMIN — Directory ------------------------------ */

function AdminStaffDirectory() {
  const { t } = useI18n();
  const { staff } = useStaffStore();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "available" | "on_shift" | "off">("all");
  const [openStaff, setOpenStaff] = useState<Staff | null>(null);

  const counts = useMemo(
    () => ({
      all: staff.length,
      available: staff.filter((s) => s.status === "available").length,
      on_shift: staff.filter((s) => s.status === "on_shift").length,
      off: staff.filter((s) => s.status === "off").length,
    }),
    [staff],
  );

  const filtered = staff.filter((s) => {
    const matchesQ = [s.name, ...s.tags, ...s.languages, s.role].join(" ").toLowerCase().includes(q.toLowerCase());
    const matchesFilter = filter === "all" || s.status === filter;
    return matchesQ && matchesFilter;
  });

  const filterTabs: { key: typeof filter; label: string }[] = [
    { key: "all", label: t.common.all },
    { key: "available", label: t.staff.availableNow },
    { key: "on_shift", label: t.staff.onShift },
    { key: "off", label: t.staff.offDuty },
  ];

  // Live in-sheet member, in case overrides change while open
  const liveOpenStaff = openStaff ? staff.find((s) => s.id === openStaff.id) ?? openStaff : null;

  return (
    <AppShell>
      <PageHeader
        title={t.staff.title}
        subtitle={t.staff.subtitle}
        actions={
          <Button onClick={() => toast.success("Staff form would open here")} className="shadow-[var(--shadow-elegant)]">
            <Plus className="h-4 w-4 mr-1" /> {t.staff.addStaff}
          </Button>
        }
      />

      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.staff.searchPlaceholder} className="pl-9 h-10 bg-card" />
        </div>
        <div className="flex gap-1 p-1 bg-muted rounded-lg overflow-x-auto">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 h-8 text-xs font-medium rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
                filter === tab.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className="text-[10px] text-muted-foreground bg-background/60 rounded px-1">{counts[tab.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((s) => {
          const yearMonth = new Date().toISOString().slice(0, 7);
          const monthOff = s.unavailability.filter((u) => u.date.startsWith(yearMonth)).length;
          const monthShifts = allShifts.filter((sh) => sh.assignedStaffId === s.id && sh.date.startsWith(yearMonth) && sh.status !== "rejected").length;

          return (
            <Card
              key={s.id}
              onClick={() => setOpenStaff(s)}
              className="p-5 border-border/60 hover:border-primary/30 hover:shadow-[var(--shadow-card)] transition-all relative overflow-hidden group cursor-pointer"
            >
              <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-primary/5 to-transparent rounded-full -mr-8 -mt-8 group-hover:from-primary/10 transition-colors" />

              <div className="flex items-start gap-4 relative">
                <Avatar name={s.name} initials={s.avatar} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{s.name}</h3>
                      <div className="text-xs text-muted-foreground capitalize">{s.role}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <StatusPill status={s.status} />
                    <a href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()} className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 truncate">
                      <Phone className="h-3 w-3 flex-shrink-0" /> {s.phone}
                    </a>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-xs relative">
                <div className="flex flex-wrap gap-1">
                  {s.tags.slice(0, 4).map((tag) => (
                    <Badge key={tag} variant="secondary" className="font-normal text-[10px] bg-primary/10 text-foreground border-0 hover:bg-primary/15">{tag}</Badge>
                  ))}
                  {s.tags.length > 4 && <Badge variant="outline" className="text-[10px]">+{s.tags.length - 4}</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="text-muted-foreground mb-0.5 font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1">
                      <LangIcon className="h-2.5 w-2.5" /> {t.common.languages}
                    </div>
                    <div className="font-medium text-foreground/90 truncate">{s.languages.join(" · ")}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5 font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1">
                      <Award className="h-2.5 w-2.5" /> {t.common.licenses}
                    </div>
                    <div className="font-medium text-foreground/90 truncate">{s.licenses.join(", ")}</div>
                  </div>
                </div>

                {/* Mini availability bar — last 14 days view */}
                <AvailabilityStrip staffMember={s} />

                <div className="flex items-center gap-3 pt-2 mt-1 border-t border-border/60 text-[11px]">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    <b className="text-foreground tabular-nums">{monthShifts}</b> shifts
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <CalendarOff className="h-3 w-3" />
                    <b className="text-foreground tabular-nums">{monthOff}</b> off
                  </span>
                  <span className="text-muted-foreground ml-auto">this month</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Profile sheet with calendar */}
      <Sheet open={!!openStaff} onOpenChange={(o) => !o && setOpenStaff(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {liveOpenStaff && (
            <>
              <SheetHeader className="space-y-3 pb-4 border-b border-border/60">
                <div className="flex items-center gap-3">
                  <Avatar name={liveOpenStaff.name} initials={liveOpenStaff.avatar} size="lg" />
                  <div>
                    <SheetTitle className="text-left">{liveOpenStaff.name}</SheetTitle>
                    <SheetDescription className="capitalize text-left">{liveOpenStaff.role} · {liveOpenStaff.phone}</SheetDescription>
                    <div className="mt-1.5"><StatusPill status={liveOpenStaff.status} /></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{t.common.languages}</div>
                    <div className="font-medium mt-0.5">{liveOpenStaff.languages.join(" · ")}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{t.common.licenses}</div>
                    <div className="font-medium mt-0.5">{liveOpenStaff.licenses.join(", ")}</div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{t.common.tags}</div>
                  <div className="flex flex-wrap gap-1">
                    {liveOpenStaff.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="font-normal text-[10px] bg-primary/10 text-foreground border-0">{tag}</Badge>
                    ))}
                  </div>
                </div>
              </SheetHeader>

              <div className="pt-5">
                <div className="mb-3">
                  <h3 className="font-semibold text-sm text-foreground">Availability</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">As an admin you can edit on their behalf — changes sync to the matcher.</p>
                </div>
                <AvailabilityCalendar staffMember={liveOpenStaff} shifts={allShifts} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

/** Compact 14-day strip used on directory cards. */
function AvailabilityStrip({ staffMember }: { staffMember: Staff }) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const u = staffMember.unavailability.find((x) => x.date === iso);
    const hasShift = allShifts.some((s) => s.assignedStaffId === staffMember.id && s.date === iso && s.status !== "rejected");
    return { iso, day: d.getDate(), dow: d.getDay(), unavail: u, hasShift };
  });

  return (
    <div>
      <div className="text-muted-foreground mb-1 font-semibold uppercase tracking-wider text-[10px]">Next 14 days</div>
      <div className="flex gap-0.5">
        {days.map((d) => {
          const cls = d.hasShift
            ? "bg-primary/40"
            : d.unavail?.allDay
              ? "bg-destructive/40"
              : d.unavail
                ? "bg-warning/40"
                : "bg-success/25";
          return <div key={d.iso} title={d.iso} className={`flex-1 h-5 rounded-sm ${cls}`} />;
        })}
      </div>
    </div>
  );
}
