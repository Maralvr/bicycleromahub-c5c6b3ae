import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Task } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { useStaffStore } from "@/lib/staff-store";

type TaskInput = Pick<Task, "title" | "description" | "due" | "priority"> & {
  assigneeIds: string[];
};

type TasksStore = {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  createTasks: (input: TaskInput) => Promise<Task[]>;
  toggleTask: (id: string, done: boolean) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

type TaskRow = {
  id: string;
  title: string;
  description?: string | null;
  assigned_to: string;
  due: string;
  priority: Task["priority"];
  done: boolean;
};

const TasksContext = createContext<TasksStore | null>(null);

export function TasksStoreProvider({ children }: { children: ReactNode }) {
  const { staff } = useStaffStore();
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("tasks")
      .select("*")
      .order("due", { ascending: true })
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setRows((data ?? []) as TaskRow[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const channel = supabase
      .channel("tasks-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        void fetchTasks();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchTasks]);

  const userIdToStaffId = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of staff) {
      if (member.profileId) map.set(member.profileId, member.id);
    }
    return map;
  }, [staff]);

  const staffIdToUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of staff) {
      if (member.profileId) map.set(member.id, member.profileId);
    }
    return map;
  }, [staff]);

  const tasks = useMemo<Task[]>(
    () =>
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description ?? undefined,
        assigneeId: userIdToStaffId.get(row.assigned_to) ?? row.assigned_to,
        due: row.due,
        priority: row.priority,
        done: row.done,
      })),
    [rows, userIdToStaffId],
  );

  const createTasks: TasksStore["createTasks"] = useCallback(
    async (input) => {
      const payload = input.assigneeIds
        .map((staffId) => {
          const assigned_to = staffIdToUserId.get(staffId);
          if (!assigned_to) return null;
          return {
            title: input.title.trim(),
            description: input.description?.trim() || null,
            assigned_to,
            due: input.due,
            priority: input.priority,
            done: false,
          };
        })
        .filter((t): t is NonNullable<typeof t> => t !== null);

      if (payload.length === 0) return [];

      let result = await supabase.from("tasks").insert(payload).select("*");
      if (result.error && result.error.message.toLowerCase().includes("description")) {
        result = await supabase
          .from("tasks")
          .insert(payload.map(({ description: _description, ...task }) => task))
          .select("*");
      }
      if (result.error) throw result.error;

      const inserted = (result.data ?? []) as TaskRow[];
      setRows((prev) => [...inserted, ...prev]);
      return inserted.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description ?? undefined,
        assigneeId: userIdToStaffId.get(row.assigned_to) ?? row.assigned_to,
        due: row.due,
        priority: row.priority,
        done: row.done,
      }));
    },
    [staffIdToUserId, userIdToStaffId],
  );

  const toggleTask: TasksStore["toggleTask"] = useCallback(
    async (id, done) => {
      const { error: updateError } = await supabase.from("tasks").update({ done }).eq("id", id);
      if (updateError) throw updateError;
      setRows((prev) => prev.map((task) => (task.id === id ? { ...task, done } : task)));

      // Notify admin when a guide completes a task
      if (done) {
        const task = rows.find((t) => t.id === id);
        const { data: authData } = await supabase.auth.getUser();
        const authorUserId = authData.user?.id;
        const me = staff.find((s) => s.profileId === authorUserId);
        if (me && task) {
          const message = `${me.name} completed task: ${task.title}`;
          void supabase.from("task_updates").insert({
            task_id: id,
            author_staff_id: me.id,
            type: "completed",
            message,
          });
          void supabase.from("field_updates").insert({
            author_id: me.id,
            type: "completed",
            message,
          });
        }
      }
    },
    [rows, staff],
  );

  const deleteTask: TasksStore["deleteTask"] = useCallback(async (id) => {
    const { error: deleteError } = await supabase.from("tasks").delete().eq("id", id);
    if (deleteError) throw deleteError;
    setRows((prev) => prev.filter((task) => task.id !== id));
  }, []);

  return (
    <TasksContext.Provider
      value={{ tasks, loading, error, createTasks, toggleTask, deleteTask, refresh: fetchTasks }}
    >
      {children}
    </TasksContext.Provider>
  );
}

export function useTasksStore() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error("useTasksStore must be used within TasksStoreProvider");
  return ctx;
}
