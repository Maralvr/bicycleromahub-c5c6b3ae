import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader, StatusPill } from "@/components/page-header";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useShiftsStore } from "@/lib/shifts-store";
import { useStaffStore } from "@/lib/staff-store";
import { useTasksStore } from "@/lib/tasks-store";
import { useNotesStore } from "@/lib/notes-store";
import { useRequireAdmin } from "@/lib/require-admin";
import {
  AlertTriangle,
  CalendarRange,
  ClipboardCheck,
  Users2,
  Sparkles,
  MapPin,
  Clock,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — eBicycle Roma" },
      {
        name: "description",
        content: "Today's overview of shifts, staff and tasks at eBicycle Roma.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { ready } = useRequireAdmin();
  const { t } = useI18n();
  const { staff } = useStaffStore();
  const { tasks } = useTasksStore();
  const { feed } = useNotesStore();
  const { shifts } = useShiftsStore();
  const today = new Date().toISOString().slice(0, 10);
  if (!ready) return null;
  const todayShifts = shifts.filter((s) => s.date === today);
  const pending = shifts.filter((s) => s.status === "pending");
  const unassigned = shifts.filter((s) => s.status === "unassigned");
  const openTasks = tasks.filter((t) => !t.done);
  const activeStaff = staff.filter((s) => s.status !== "off").length;

  const stats = [
    {
      label: t.dashboard.shiftsToday,
      value: todayShifts.length,
      sub: "+2 vs yesterday",
      icon: CalendarRange,
      accent: true,
    },
    {
      label: t.dashboard.pendingAccept,
      value: pending.length,
      sub: "Awaiting response",
      icon: Clock,
    },
    {
      label: t.dashboard.activeStaff,
      value: `${activeStaff}/${staff.length}`,
      sub: "On the clock",
      icon: Users2,
    },
    {
      label: t.dashboard.openTasks,
      value: openTasks.length,
      sub: `${tasks.length - openTasks.length} done today`,
      icon: ClipboardCheck,
    },
  ];

  return (
    <AppShell>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-US", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        title={t.dashboard.title}
        subtitle={t.dashboard.subtitle}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Card
            key={s.label}
            className={`p-5 border-border/60 relative overflow-hidden group hover:shadow-[var(--shadow-card)] transition-all ${s.accent ? "bg-gradient-to-br from-primary/10 via-card to-card border-primary/20" : ""}`}
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${s.accent ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70"}`}
              >
                <s.icon className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="text-3xl font-bold text-foreground tracking-tight">{s.value}</div>
            <div className="text-sm font-medium text-foreground/80 mt-1">{s.label}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> {s.sub}
            </div>
          </Card>
        ))}
      </div>

      {unassigned.length > 0 && (
        <Card className="p-5 mb-8 border-warning/40 bg-gradient-to-br from-warning/10 via-warning/5 to-transparent relative overflow-hidden">
          <div className="absolute top-0 right-0 h-32 w-32 bg-warning/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-start gap-4 relative">
            <div className="h-11 w-11 rounded-xl bg-warning/20 flex items-center justify-center ring-1 ring-warning/30">
              <AlertTriangle className="h-5 w-5 text-warning-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-foreground flex items-center gap-2">
                {t.dashboard.coverageRisk}
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary-foreground px-1.5 py-0.5 rounded">
                  <Sparkles className="h-3 w-3" /> AI
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {unassigned.length} shift(s) still need a guide. AI suggests reaching out to
                available staff with matching tags.
              </p>
              <div className="mt-3 space-y-2">
                {unassigned.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between bg-card rounded-lg p-3 border border-border/60 hover:border-primary/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{s.tourName}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span>{s.date}</span>
                        <span>·</span>
                        <Clock className="h-3 w-3" /> {s.startTime}
                        <span>·</span>
                        <MapPin className="h-3 w-3" /> {s.meetingPoint}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StatusPill status={s.status} />
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        Assign
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">{t.dashboard.upcomingShifts}</h2>
            <button className="text-xs text-primary font-medium hover:underline">View all →</button>
          </div>
          <div className="space-y-1">
            {shifts.slice(0, 5).map((s) => {
              const guide = staff.find((p) => p.id === s.assignedStaffId);
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors group cursor-pointer"
                >
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex flex-col items-center justify-center text-primary-foreground flex-shrink-0">
                    <div className="text-[9px] uppercase tracking-wider opacity-80 leading-none">
                      {s.startTime.slice(0, 2)}h
                    </div>
                    <div className="text-sm font-bold leading-tight">{s.startTime.slice(3, 5)}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                      {s.tourName}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 flex-shrink-0" />{" "}
                      <span className="truncate">{s.meetingPoint}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {guide ? (
                      <div className="flex items-center gap-1.5">
                        <Avatar name={guide.name} initials={guide.avatar} size="sm" />
                        <span className="text-xs font-medium hidden sm:inline">
                          {guide.name.split(" ")[0]}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    <StatusPill status={s.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">{t.dashboard.recentActivity}</h2>
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
          </div>
          <div className="space-y-4">
            {feed.slice(0, 5).map((u) => {
              const author = staff.find((s) => s.id === u.authorId);
              return (
                <div key={u.id} className="flex gap-3">
                  <Avatar
                    name={author?.name || "Admin"}
                    initials={author?.avatar || "AD"}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-semibold text-foreground">
                        {author?.name || "Admin"}
                      </span>
                      <span className="text-muted-foreground">· {u.time}</span>
                    </div>
                    <p className="text-sm text-foreground/80 mt-0.5 leading-snug">{u.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
