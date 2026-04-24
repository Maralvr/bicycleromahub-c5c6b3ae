import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { tasks as initialTasks, staff, Task } from "@/lib/mock-data";
import { Plus, Calendar, AlertCircle } from "lucide-react";
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
  high: "bg-destructive/15 text-destructive border-destructive/30",
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

  return (
    <AppShell>
      <PageHeader
        title={t.tasks.title}
        subtitle={t.tasks.subtitle}
        actions={
          <Button onClick={() => toast.success("Task editor would open")}>
            <Plus className="h-4 w-4 mr-1" /> {t.tasks.newTask}
          </Button>
        }
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="h-4 w-4 text-warning-foreground" />
            <h2 className="font-semibold">{t.common.todo} <span className="text-muted-foreground font-normal">({open.length})</span></h2>
          </div>
          <div className="space-y-2">
            {open.map((task) => <TaskRow key={task.id} task={task} onToggle={toggle} />)}
            {open.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">All done! 🎉</div>}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">{t.common.done} <span className="text-muted-foreground font-normal">({done.length})</span></h2>
          <div className="space-y-2">
            {done.map((task) => <TaskRow key={task.id} task={task} onToggle={toggle} />)}
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
    <div className={`flex items-start gap-3 p-3 rounded-lg border border-border ${task.done ? "opacity-60" : "bg-card hover:border-primary/40 transition-colors"}`}>
      <Checkbox checked={task.done} onCheckedChange={() => onToggle(task.id)} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{task.title}</div>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {assignee && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-primary-foreground text-[9px] font-bold">{assignee.avatar}</div>
              {assignee.name}
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" /> {task.due}
          </div>
          <Badge variant="outline" className={`text-[10px] uppercase ${priorityStyles[task.priority]}`}>
            {t.common[task.priority]}
          </Badge>
        </div>
      </div>
    </div>
  );
}
