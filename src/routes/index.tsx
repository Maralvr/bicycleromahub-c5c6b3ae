import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader, StatusPill } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { shifts, staff, tasks, updates } from "@/lib/mock-data";
import { AlertTriangle, CalendarRange, ClipboardCheck, Users2, Sparkles, MapPin, Clock } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — eBicycle Roma" },
      { name: "description", content: "Today's overview of shifts, staff and tasks at eBicycle Roma." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const todayShifts = shifts.filter((s) => s.date === today);
  const pending = shifts.filter((s) => s.status === "pending");
  const unassigned = shifts.filter((s) => s.status === "unassigned");
  const openTasks = tasks.filter((t) => !t.done);
  const activeStaff = staff.filter((s) => s.status !== "off").length;

  const stats = [
    { label: t.dashboard.shiftsToday, value: todayShifts.length, icon: CalendarRange, color: "text-primary", bg: "bg-primary/10" },
    { label: t.dashboard.pendingAccept, value: pending.length, icon: Clock, color: "text-warning-foreground", bg: "bg-warning/15" },
    { label: t.dashboard.activeStaff, value: activeStaff, icon: Users2, color: "text-success-foreground", bg: "bg-success/15" },
    { label: t.dashboard.openTasks, value: openTasks.length, icon: ClipboardCheck, color: "text-foreground", bg: "bg-accent" },
  ];

  return (
    <AppShell>
      <PageHeader title={t.dashboard.title} subtitle={t.dashboard.subtitle} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label} className="p-5 border-border shadow-[var(--shadow-card)]">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${s.bg} ${s.color} mb-3`}>
              <s.icon className="h-5 w-5" />
            </div>
            <div className="text-3xl font-bold text-foreground">{s.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
          </Card>
        ))}
      </div>

      {unassigned.length > 0 && (
        <Card className="p-5 mb-6 border-warning/40 bg-warning/5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-warning/20 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-warning-foreground" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-foreground flex items-center gap-2">
                {t.dashboard.coverageRisk}
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {unassigned.length} shift(s) still need a guide. AI suggests reaching out to available staff with matching tags.
              </p>
              <div className="mt-3 space-y-2">
                {unassigned.map((s) => (
                  <div key={s.id} className="flex items-center justify-between bg-card rounded-lg p-3 border border-border">
                    <div>
                      <div className="font-medium text-sm">{s.tourName}</div>
                      <div className="text-xs text-muted-foreground">{s.date} · {s.startTime}</div>
                    </div>
                    <StatusPill status={s.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="font-semibold text-foreground mb-4">{t.dashboard.upcomingShifts}</h2>
          <div className="space-y-3">
            {shifts.slice(0, 5).map((s) => {
              const guide = staff.find((p) => p.id === s.assignedStaffId);
              return (
                <div key={s.id} className="flex items-center gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-primary-foreground text-xs font-bold">
                    {s.startTime.slice(0, 5)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{s.tourName}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {s.meetingPoint}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">{guide?.name || "—"}</div>
                    <StatusPill status={s.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold text-foreground mb-4">{t.dashboard.recentActivity}</h2>
          <div className="space-y-4">
            {updates.map((u) => {
              const author = staff.find((s) => s.id === u.authorId);
              return (
                <div key={u.id} className="flex gap-3">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${u.type === "broadcast" ? "bg-secondary text-secondary-foreground" : "bg-primary/15 text-foreground"}`}>
                    {author?.avatar || "AD"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-foreground">{author?.name || "Admin"}</span>
                      <span className="text-muted-foreground">· {u.time}</span>
                    </div>
                    <p className="text-sm text-foreground/80 mt-0.5">{u.message}</p>
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
