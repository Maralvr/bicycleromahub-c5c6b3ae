import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/current-user";
import { tasks as initialTasks, staff, Task } from "@/lib/mock-data";
import { Plus, Calendar, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — eBicycle Roma" },
      { name: "description", content: "Daily checks and operational tasks for the team." },
    ],
  }),
  component: TasksPage,
});

const priorityStyles = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-warning/15 text-warning-foreground border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
};

function TasksPage() {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  const toggle = (id: string) => {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  };

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const completion = tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0;

  return (
    <AppShell>
      <PageHeader
        title={t.tasks.title}
        subtitle={t.tasks.subtitle}
        actions={
          <Button onClick={() => toast.success("Task editor would open")} className="shadow-[var(--shadow-elegant)]">
            <Plus className="h-4 w-4 mr-1" /> {t.tasks.newTask}
          </Button>
        }
      />

      <Card className="p-5 mb-6 bg-gradient-to-br from-primary/8 via-card to-card border-primary/20">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Today's progress</div>
            <div className="text-2xl font-bold tracking-tight">{done.length} <span className="text-muted-foreground font-medium text-base">/ {tasks.length} completed</span></div>
          </div>
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-primary-glow rounded-full transition-all" style={{ width: `${completion}%` }} />
            </div>
            <span className="text-sm font-bold tabular-nums">{completion}%</span>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-7 w-7 rounded-lg bg-warning/15 flex items-center justify-center">
              <AlertCircle className="h-4 w-4 text-warning-foreground" />
            </div>
            <h2 className="font-semibold">{t.common.todo}</h2>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{open.length}</span>
          </div>
          <div className="space-y-2">
            {open.map((task) => <TaskRow key={task.id} task={task} onToggle={toggle} />)}
            {open.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">All done! 🎉</div>}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-7 w-7 rounded-lg bg-success/15 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-success-foreground" />
            </div>
            <h2 className="font-semibold">{t.common.done}</h2>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{done.length}</span>
          </div>
          <div className="space-y-2">
            {done.map((task) => <TaskRow key={task.id} task={task} onToggle={toggle} />)}
            {done.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No tasks completed yet.</div>}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) {
  const { t } = useI18n();
  const assignee = staff.find((s) => s.id === task.assigneeId);
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${task.done ? "border-border/40 opacity-60 bg-muted/30" : "border-border/60 bg-card hover:border-primary/40 hover:shadow-sm"}`}>
      <Checkbox checked={task.done} onCheckedChange={() => onToggle(task.id)} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium leading-snug ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{task.title}</div>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {assignee && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Avatar name={assignee.name} initials={assignee.avatar} size="sm" className="!h-5 !w-5 text-[9px] !rounded-full" />
              <span className="font-medium text-foreground/80">{assignee.name}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" /> {task.due}
          </div>
          <Badge variant="outline" className={`text-[10px] uppercase tracking-wider font-bold ${priorityStyles[task.priority]}`}>
            {t.common[task.priority]}
          </Badge>
        </div>
      </div>
    </div>
  );
}
