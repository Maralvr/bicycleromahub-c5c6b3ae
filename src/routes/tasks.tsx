import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth";
import { useRentalTasks, type RentalTaskUpdate } from "@/lib/rental-tasks";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/current-user";
import { useStaffStore } from "@/lib/staff-store";
import { useNotesStore } from "@/lib/notes-store";
import { useTaskUpdates, TaskUpdate } from "@/lib/task-updates-store";
import { useTasksStore } from "@/lib/tasks-store";
import { Staff, Task, Attachment } from "@/lib/mock-data";
import { AttachmentPicker, AttachmentList } from "@/components/attachment-picker";
import {
  Plus,
  Calendar,
  AlertCircle,
  CheckCircle2,
  MessageSquarePlus,
  Activity,
  Wrench,
  MessageSquare,
  BellDot,
  Search,
  Trash2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — Bicycle Roma" },
      { name: "description", content: "Daily checks and operational tasks for the team." },
    ],
  }),
  component: TasksPageRouter,
});

function TasksPageRouter() {
  // public.tasks/task_updates are hard-linked to public.staff (guides/
  // admins), and none of the providers TasksPage relies on
  // (CurrentUserProvider, StaffStoreProvider, TasksStoreProvider, etc.) are
  // mounted for rental-staff-only sessions (see AuthenticatedDataProviders
  // in __root.tsx) -- calling TasksPage directly throws "must be used
  // within Provider" and crashes the page. Rental staff have their own
  // parallel rental_staff_tasks/rental_staff_task_updates tables instead
  // (20260705000000 migration), surfaced via RentalStaffTasksView below.
  const { isRentalStaff, isAuthenticated, loading, rolesLoaded } = useAuth();
  if (loading || !isAuthenticated || !rolesLoaded) return null;
  if (isRentalStaff) return <RentalStaffTasksView />;
  return <TasksPage />;
}

function RentalStaffTasksView() {
  const { tasks, loading, updatesByTask, toggleTask, addUpdate } = useRentalTasks();
  const [updateDialogTask, setUpdateDialogTask] = useState<Task | null>(null);

  const open = tasks.filter((x) => !x.done);
  const done = tasks.filter((x) => x.done);
  const completion = tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0;

  if (loading) {
    return (
      <AppShell>
        <div className="text-sm text-muted-foreground py-12 text-center">Loading your tasks…</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Tasks" subtitle="Your assigned tasks" />

      <Card className="p-5 mb-6 bg-gradient-to-br from-primary/8 via-card to-card border-primary/20">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">
              Today's progress
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {done.length}{" "}
              <span className="text-muted-foreground font-medium text-base">/ {tasks.length} completed</span>
            </div>
          </div>
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary-glow rounded-full transition-all"
                style={{ width: `${completion}%` }}
              />
            </div>
            <span className="text-sm font-bold tabular-nums">{completion}%</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-7 w-7 rounded-lg bg-warning/15 flex items-center justify-center">
              <AlertCircle className="h-4 w-4 text-warning-foreground" />
            </div>
            <h2 className="font-semibold">To do</h2>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{open.length}</span>
          </div>
          <div className="space-y-2">
            {open.map((task) => (
              <RentalTaskRow
                key={task.id}
                task={task}
                updates={updatesByTask.get(task.id) ?? []}
                onToggle={() => toggleTask(task.id, !task.done)}
                onPostUpdate={() => setUpdateDialogTask(task)}
              />
            ))}
            {open.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">All done! 🎉</div>}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-7 w-7 rounded-lg bg-success/15 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-success-foreground" />
            </div>
            <h2 className="font-semibold">Done</h2>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{done.length}</span>
          </div>
          <div className="space-y-2">
            {done.map((task) => (
              <RentalTaskRow
                key={task.id}
                task={task}
                updates={updatesByTask.get(task.id) ?? []}
                onToggle={() => toggleTask(task.id, !task.done)}
                onPostUpdate={() => setUpdateDialogTask(task)}
              />
            ))}
            {done.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No tasks completed yet.</div>}
          </div>
        </Card>
      </div>

      <Dialog open={!!updateDialogTask} onOpenChange={(o) => !o && setUpdateDialogTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post an update</DialogTitle>
            <DialogDescription>{updateDialogTask?.title}</DialogDescription>
          </DialogHeader>
          <RentalUpdateForm
            updates={updateDialogTask ? updatesByTask.get(updateDialogTask.id) ?? [] : []}
            onSubmit={async (message) => {
              if (!updateDialogTask) return;
              await addUpdate(updateDialogTask.id, message);
              setUpdateDialogTask(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function RentalTaskRow({
  task,
  updates,
  onToggle,
  onPostUpdate,
}: {
  task: Task;
  updates: RentalTaskUpdate[];
  onToggle: () => void;
  onPostUpdate: () => void;
}) {
  return (
    <div
      className={`p-3 rounded-lg border transition-all ${task.done ? "border-border/40 opacity-70 bg-muted/30" : "border-border/60 bg-card hover:border-primary/40 hover:shadow-sm"}`}
    >
      <div className="flex items-start gap-3">
        <Checkbox checked={task.done} onCheckedChange={onToggle} className="mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium leading-snug ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {task.title}
          </div>
          {task.description && (
            <p className={`text-xs mt-1 whitespace-pre-wrap ${task.done ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
              {task.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" /> {task.due}
            </div>
            <Badge variant="outline" className={`text-[10px] uppercase tracking-wider font-bold ${priorityStyles[task.priority]}`}>
              {task.priority}
            </Badge>
            {updates.length > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Activity className="h-2.5 w-2.5" /> {updates.length} update{updates.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <div className="mt-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onPostUpdate}>
              <MessageSquarePlus className="h-3 w-3 mr-1" /> Post update
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RentalUpdateForm({
  updates,
  onSubmit,
}: {
  updates: RentalTaskUpdate[];
  onSubmit: (message: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);

  return (
    <div className="space-y-4">
      {updates.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {updates.map((u) => (
            <div key={u.id} className="text-xs p-2 rounded-md bg-muted/50 border border-border/40">
              <div className="text-foreground">{u.message}</div>
              <div className="text-muted-foreground mt-1">
                {u.authorRentalStaffId ? "You" : "Admin"} · {new Date(u.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What's the update?"
        rows={3}
      />
      <DialogFooter>
        <Button
          disabled={!message.trim() || posting}
          onClick={async () => {
            setPosting(true);
            try {
              await onSubmit(message.trim());
              setMessage("");
            } finally {
              setPosting(false);
            }
          }}
        >
          Post
        </Button>
      </DialogFooter>
    </div>
  );
}

const priorityStyles = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-warning/15 text-warning-foreground border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
};

function TasksPage() {
  const { t } = useI18n();
  const { role, staffId } = useCurrentUser();
  const isAdmin = role === "admin";
  const { staff } = useStaffStore();
  const { tasks: allTasks, createTasks, toggleTask, deleteTask } = useTasksStore();
  const { updatesForTask, addUpdate, unreadCount, markAllRead } = useTaskUpdates();
  const { notifyGuides } = useNotesStore();
  const [updateDialogTask, setUpdateDialogTask] = useState<Task | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  const tasks = isAdmin ? allTasks : allTasks.filter((task) => task.assigneeId === staffId);
  const adminIds = staff.filter((s) => s.role === "admin").map((s) => s.id);
  const guideOptions = staff.filter((s) => s.role === "guide" || s.role === "admin");

  const createTask = async (input: {
    title: string;
    description: string;
    assigneeIds: string[];
    due: string;
    priority: Task["priority"];
  }) => {
    let newTasks: Task[] = [];
    try {
      newTasks = await createTasks(input);
    } catch (error) {
      toast.error("Could not create task", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
      return;
    }
    setNewTaskOpen(false);
    const assigneeIds = newTasks.map((task) => task.assigneeId);

    // Admin assigned to multiple guides -> notify each guide
    if (isAdmin && assigneeIds.length > 0) {
      notifyGuides(assigneeIds, {
        type: "task",
        title: assigneeIds.length > 1 ? "New task for the team" : "New task assigned",
        body: input.title.trim(),
        link: "/tasks",
      });
      toast.success(
        assigneeIds.length > 1 ? `Task assigned to ${assigneeIds.length} guides` : "Task assigned",
      );
      return;
    }

    // If a guide created a task for themselves, notify admins
    if (!isAdmin && input.assigneeIds[0] === staffId) {
      const me = staff.find((s) => s.id === staffId);
      if (adminIds.length > 0) {
        notifyGuides(adminIds, {
          type: "task",
          title: "New self-assigned task",
          body: `${me?.name || "Guide"} added: ${input.title.trim()}`,
          link: "/tasks",
        });
      }
      toast.success("Task added", { description: "Admins notified." });
    } else {
      toast.success("Task added");
    }
  };

  const toggle = async (id: string) => {
    const task = allTasks.find((x) => x.id === id);
    if (!task) return;
    const nowDone = !task.done;
    try {
      await toggleTask(id, nowDone);
    } catch (error) {
      toast.error("Could not update task", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
      return;
    }
    // Guides marking their own task as done -> live update for admins
    if (!isAdmin && task.assigneeId === staffId && nowDone) {
      const me = staff.find((s) => s.id === staffId);
      addUpdate({
        taskId: id,
        authorStaffId: staffId!,
        message: `Marked as done`,
        type: "completed",
      });
      // Push admin notification (reuses NotesStore broadcast plumbing)
      if (adminIds.length > 0) {
        notifyGuides(adminIds, {
          type: "task",
          title: "Task completed",
          body: `${me?.name || "Guide"} completed: ${task.title}`,
          link: "/tasks",
        });
      }
      toast.success("Task completed", { description: "Admins notified." });
    }
  };

  const handleDelete = async (task: Task) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete task "${task.title}"?`)) return;
    try {
      await deleteTask(task.id);
      toast.success("Task deleted");
    } catch (error) {
      toast.error("Could not delete task", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const submitUpdate = (
    task: Task,
    message: string,
    type: TaskUpdate["type"],
    attachments: Attachment[],
  ) => {
    if (!staffId) return;
    addUpdate({
      taskId: task.id,
      authorStaffId: staffId,
      message,
      type,
      attachments: attachments.length ? attachments : undefined,
    });
    const me = staff.find((s) => s.id === staffId);
    if (adminIds.length > 0) {
      notifyGuides(adminIds, {
        type: "task",
        title: type === "blocker" ? "Task blocker reported" : "Task update",
        body: `${me?.name || "Guide"} on "${task.title}": ${message}`,
        link: "/tasks",
        attachments: attachments.length ? attachments : undefined,
      });
    }
    setUpdateDialogTask(null);
    toast.success("Update sent to admins");
  };

  const open = tasks.filter((x) => !x.done);
  const done = tasks.filter((x) => x.done);
  const completion = tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0;

  return (
    <AppShell>
      <PageHeader
        title={t.tasks.title}
        subtitle={isAdmin ? t.tasks.subtitle : "Your assigned tasks"}
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  markAllRead();
                  toast.success("Marked updates as read");
                }}
              >
                <BellDot className="h-4 w-4 mr-1" /> {unreadCount} new update
                {unreadCount > 1 ? "s" : ""}
              </Button>
            )}
            <Button onClick={() => setNewTaskOpen(true)} className="shadow-[var(--shadow-elegant)]">
              <Plus className="h-4 w-4 mr-1" /> {isAdmin ? t.tasks.newTask : "Add task for me"}
            </Button>
          </div>
        }
      />

      <Card className="p-5 mb-6 bg-gradient-to-br from-primary/8 via-card to-card border-primary/20">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">
              Today's progress
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {done.length}{" "}
              <span className="text-muted-foreground font-medium text-base">
                / {tasks.length} completed
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary-glow rounded-full transition-all"
                style={{ width: `${completion}%` }}
              />
            </div>
            <span className="text-sm font-bold tabular-nums">{completion}%</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-7 w-7 rounded-lg bg-warning/15 flex items-center justify-center">
              <AlertCircle className="h-4 w-4 text-warning-foreground" />
            </div>
            <h2 className="font-semibold">{t.common.todo}</h2>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">
              {open.length}
            </span>
          </div>
          <div className="space-y-2">
            {open.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                staff={staff}
                onToggle={toggle}
                isAdmin={isAdmin}
                isMine={task.assigneeId === staffId}
                updates={updatesForTask(task.id)}
                onPostUpdate={() => setUpdateDialogTask(task)}
                onDelete={isAdmin ? () => handleDelete(task) : undefined}
              />
            ))}
            {open.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">All done! 🎉</div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-7 w-7 rounded-lg bg-success/15 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-success-foreground" />
            </div>
            <h2 className="font-semibold">{t.common.done}</h2>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">
              {done.length}
            </span>
          </div>
          <div className="space-y-2">
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                staff={staff}
                onToggle={toggle}
                isAdmin={isAdmin}
                isMine={task.assigneeId === staffId}
                updates={updatesForTask(task.id)}
                onPostUpdate={() => setUpdateDialogTask(task)}
                onDelete={isAdmin ? () => handleDelete(task) : undefined}
              />
            ))}
            {done.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">
                No tasks completed yet.
              </div>
            )}
          </div>
        </Card>
      </div>

      <UpdateDialog
        task={updateDialogTask}
        onClose={() => setUpdateDialogTask(null)}
        onSubmit={submitUpdate}
      />

      <NewTaskDialog
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        onCreate={createTask}
        isAdmin={isAdmin}
        currentStaffId={staffId}
        guideOptions={guideOptions}
      />
    </AppShell>
  );
}

const updateTypeStyles: Record<
  TaskUpdate["type"],
  { label: string; cls: string; Icon: typeof MessageSquare }
> = {
  progress: {
    label: "Update",
    cls: "bg-primary/10 text-primary border-primary/30",
    Icon: MessageSquare,
  },
  completed: {
    label: "Done",
    cls: "bg-success/15 text-success-foreground border-success/30",
    Icon: CheckCircle2,
  },
  blocker: {
    label: "Blocker",
    cls: "bg-destructive/10 text-destructive border-destructive/30",
    Icon: Wrench,
  },
};

function TaskRow({
  task,
  staff,
  onToggle,
  isAdmin,
  isMine,
  updates,
  onPostUpdate,
  onDelete,
}: {
  task: Task;
  staff: Staff[];
  onToggle: (id: string) => void;
  isAdmin: boolean;
  isMine: boolean;
  updates: TaskUpdate[];
  onPostUpdate: () => void;
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  const { loadTaskAttachments } = useTaskUpdates();
  const assignee = staff.find((s) => s.id === task.assigneeId);
  const canCheck = isAdmin || isMine;
  const canPostUpdate = isMine && !isAdmin;
  const hasUnread = updates.some((u) => !u.read);

  // Attachments are excluded from the task_updates list query; fetch them once
  // per task that actually has updates on screen.
  const hasUpdates = updates.length > 0;
  useEffect(() => {
    if (hasUpdates) void loadTaskAttachments(task.id);
  }, [hasUpdates, task.id, loadTaskAttachments]);


  return (
    <div
      className={`p-3 rounded-lg border transition-all ${task.done ? "border-border/40 opacity-70 bg-muted/30" : "border-border/60 bg-card hover:border-primary/40 hover:shadow-sm"} ${hasUnread && isAdmin ? "ring-1 ring-primary/40" : ""}`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={task.done}
          onCheckedChange={() => canCheck && onToggle(task.id)}
          disabled={!canCheck}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div
            className={`text-sm font-medium leading-snug ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`}
          >
            {task.title}
          </div>
          {task.description && (
            <p
              className={`text-xs mt-1 whitespace-pre-wrap ${task.done ? "text-muted-foreground/70" : "text-muted-foreground"}`}
            >
              {task.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {assignee && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Avatar
                  name={assignee.name}
                  initials={assignee.avatar}
                  size="sm"
                  className="!h-5 !w-5 text-[9px] !rounded-full"
                />
                <span className="font-medium text-foreground/80">{assignee.name}</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" /> {task.due}
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] uppercase tracking-wider font-bold ${priorityStyles[task.priority]}`}
            >
              {t.common[task.priority]}
            </Badge>
            {updates.length > 0 && (
              <Badge
                variant="outline"
                className={`text-[10px] gap-1 ${hasUnread && isAdmin ? "border-primary text-primary" : ""}`}
              >
                <Activity className="h-2.5 w-2.5" /> {updates.length} update
                {updates.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {(canPostUpdate || onDelete) && (
            <div className="mt-2 flex gap-2 flex-wrap">
              {canPostUpdate && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onPostUpdate}>
                  <MessageSquarePlus className="h-3 w-3 mr-1" /> Post update
                </Button>
              )}
              {onDelete && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
              )}
            </div>
          )}

          {updates.length > 0 && (
            <div className="mt-3 space-y-1.5 border-l-2 border-border/60 pl-3">
              {updates.slice(0, 4).map((u) => {
                const author = staff.find((s) => s.id === u.authorStaffId);
                const meta = updateTypeStyles[u.type];
                const Icon = meta.Icon;
                const time = new Date(u.createdAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div key={u.id} className="text-xs flex items-start gap-2">
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wider ${meta.cls}`}
                    >
                      <Icon className="h-2.5 w-2.5" /> {meta.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-foreground/85">{u.message}</div>
                      {u.attachments && u.attachments.length > 0 && (
                        <AttachmentList attachments={u.attachments} />
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {author?.name || "Guide"} · {time}
                        {!u.read && isAdmin && (
                          <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {updates.length > 4 && (
                <div className="text-[10px] text-muted-foreground italic">
                  +{updates.length - 4} earlier updates
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UpdateDialog({
  task,
  onClose,
  onSubmit,
}: {
  task: Task | null;
  onClose: () => void;
  onSubmit: (
    task: Task,
    message: string,
    type: TaskUpdate["type"],
    attachments: Attachment[],
  ) => void;
}) {
  const [message, setMessage] = useState("");
  const [type, setType] = useState<TaskUpdate["type"]>("progress");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const open = !!task;
  const reset = () => {
    setMessage("");
    setType("progress");
    setAttachments([]);
  };
  const handleSubmit = () => {
    if (!task || (!message.trim() && attachments.length === 0)) return;
    onSubmit(
      task,
      message.trim() ||
        (attachments.length === 1
          ? `Shared ${attachments[0].name}`
          : `Shared ${attachments.length} files`),
      type,
      attachments,
    );
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post task update</DialogTitle>
          <DialogDescription>{task?.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["progress", "blocker", "completed"] as TaskUpdate["type"][]).map((opt) => {
              const meta = updateTypeStyles[opt];
              const Icon = meta.Icon;
              const active = type === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setType(opt)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-xs font-semibold capitalize transition ${active ? meta.cls : "bg-card border-border text-muted-foreground hover:border-primary/40"}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {meta.label}
                </button>
              );
            })}
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What's the update? E.g. 'Halfway done, need a replacement helmet'..."
            rows={4}
            className="resize-none"
          />
          <AttachmentPicker attachments={attachments} onChange={setAttachments} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!message.trim() && attachments.length === 0}>
            Send to admins
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewTaskDialog({
  open,
  onClose,
  onCreate,
  isAdmin,
  currentStaffId,
  guideOptions,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    description: string;
    assigneeIds: string[];
    due: string;
    priority: Task["priority"];
  }) => void;
  isAdmin: boolean;
  currentStaffId: string | null | undefined;
  guideOptions: Staff[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const initialIds = () =>
    isAdmin
      ? guideOptions[0]
        ? [guideOptions[0].id]
        : []
      : currentStaffId
        ? [currentStaffId]
        : [];
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initialIds());
  const [due, setDue] = useState(today);
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [guideQuery, setGuideQuery] = useState("");

  const filteredGuides = guideOptions.filter((g) =>
    g.name.toLowerCase().includes(guideQuery.trim().toLowerCase()),
  );

  const reset = () => {
    setTitle("");
    setDescription("");
    setAssigneeIds(initialIds());
    setDue(today);
    setPriority("medium");
    setGuideQuery("");
  };

  const submit = () => {
    if (!title.trim() || assigneeIds.length === 0) return;
    onCreate({ title, description, assigneeIds, due, priority });
    reset();
  };

  const baseList = guideQuery.trim() ? filteredGuides : guideOptions;
  const allSelected =
    isAdmin && baseList.length > 0 && baseList.every((g) => assigneeIds.includes(g.id));
  const toggleAll = () => {
    if (allSelected) {
      const ids = new Set(baseList.map((g) => g.id));
      setAssigneeIds((prev) => prev.filter((id) => !ids.has(id)));
    } else {
      setAssigneeIds((prev) => Array.from(new Set([...prev, ...baseList.map((g) => g.id)])));
    }
  };
  const toggleOne = (id: string) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isAdmin ? "New task" : "Add a task for yourself"}</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Assign a task to one, several, or all guides."
              : "Track something you need to do today."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Inspect bike #12 brakes"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Description{" "}
              <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add context, steps, or anything the assignee should know…"
              rows={3}
            />
          </div>

          {isAdmin ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>
                  Assignees{" "}
                  {assigneeIds.length > 0 && (
                    <span className="text-xs text-muted-foreground font-normal">
                      ({assigneeIds.length})
                    </span>
                  )}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={toggleAll}
                  disabled={baseList.length === 0}
                >
                  {allSelected
                    ? guideQuery.trim()
                      ? "Clear filtered"
                      : "Clear all"
                    : guideQuery.trim()
                      ? "Select filtered"
                      : "Select all"}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={
                    assigneeIds.length === guideOptions.length && guideOptions.length > 0
                      ? "default"
                      : "outline"
                  }
                  className="h-8 text-xs"
                  onClick={() => setAssigneeIds(guideOptions.map((g) => g.id))}
                  disabled={guideOptions.length === 0}
                >
                  👥 Assign to everyone ({guideOptions.length})
                </Button>
                {currentStaffId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => setAssigneeIds([currentStaffId])}
                  >
                    Just me
                  </Button>
                )}
                {assigneeIds.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => setAssigneeIds([])}
                  >
                    Clear
                  </Button>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={guideQuery}
                  onChange={(e) => setGuideQuery(e.target.value)}
                  placeholder="Search guides…"
                  className="pl-8 h-9"
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {filteredGuides.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No guides match “{guideQuery}”.
                  </div>
                ) : (
                  filteredGuides.map((g) => {
                    const checked = assigneeIds.includes(g.id);
                    return (
                      <label
                        key={g.id}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50"
                      >
                        <Checkbox checked={checked} onCheckedChange={() => toggleOne(g.id)} />
                        <span className="text-sm">{g.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {assigneeIds.length === guideOptions.length && guideOptions.length > 0
                  ? "Every guide will receive a private copy. Each guide sees only their own; admins see all."
                  : assigneeIds.length > 1
                    ? `Each of the ${assigneeIds.length} selected guides gets a private copy — only they and admins can see it.`
                    : "Only the assigned guide and admins will see this task."}
              </p>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              This task will be assigned to you and visible to admins.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Due</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Task["priority"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!title.trim() || assigneeIds.length === 0}>
            <Plus className="h-4 w-4 mr-1" />{" "}
            {assigneeIds.length > 1 ? `Add ${assigneeIds.length} tasks` : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
