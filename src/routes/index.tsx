import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
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
  CalendarRange,
  ClipboardCheck,
  Users2,
  ArrowUpRight,
  TrendingUp,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Bicycle Roma" },
      {
        name: "description",
        content: "Today's overview of shifts, staff and tasks at Bicycle Roma.",
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
      to: "/live-shifts" as const,
      search: undefined,
    },
    {
      label: t.dashboard.pendingAccept,
      value: pending.length,
      sub: "Awaiting response",
      icon: Clock,
      to: "/shifts" as const,
      search: { tab: "all" as const, status: "pending" as const },
    },
    {
      label: t.dashboard.activeStaff,
      value: `${activeStaff}/${staff.length}`,
      sub: "On the clock",
      icon: Users2,
      to: "/staff" as const,
      search: undefined,
    },
    {
      label: t.dashboard.openTasks,
      value: openTasks.length,
      sub: `${tasks.length - openTasks.length} done today`,
      icon: ClipboardCheck,
      to: "/tasks" as const,
      search: undefined,
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
          <Link
            key={s.label}
            to={s.to}
            search={s.search as never}
            className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Card
              className={`p-5 border-border/60 relative overflow-hidden group hover:shadow-[var(--shadow-card)] hover:border-primary/40 active:scale-[0.98] transition-all cursor-pointer h-full ${s.accent ? "bg-gradient-to-br from-primary/10 via-card to-card border-primary/20" : ""}`}
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
          </Link>
        ))}
      </div>


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
    </AppShell>
  );
}
