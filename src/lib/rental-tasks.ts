import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Task } from "@/lib/mock-data";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  due: string;
  priority: Task["priority"];
  done: boolean;
  created_at: string;
};

export type RentalTaskUpdate = {
  id: string;
  taskId: string;
  authorRentalStaffId: string | null;
  message: string;
  type: "progress" | "completed" | "blocker";
  createdAt: string;
};

type UpdateRow = {
  id: string;
  task_id: string;
  author_rental_staff_id: string | null;
  message: string;
  type: RentalTaskUpdate["type"];
  created_at: string;
};

/**
 * Tasks assigned to the caller's own rental_staff row. Mirrors useTasksStore
 * + useTaskUpdates for guides, but reads from rental_staff_tasks /
 * rental_staff_task_updates (see 20260705000000 migration) since tasks and
 * task_updates are hard-linked to public.staff and rental staff have no row
 * there. These tables aren't in the generated Supabase types yet, so `as
 * never` on .from(...) is used, matching the existing pattern for the same
 * situation elsewhere in this codebase (booking-notes-thread.tsx,
 * dispatch-history.tsx).
 */
export function useRentalTasks() {
  const { user } = useAuth();
  const [rentalStaffId, setRentalStaffId] = useState<string | null>(null);
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: staffRow } = await supabase
      .from("rental_staff")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!staffRow) {
      setRentalStaffId(null);
      setRows([]);
      setUpdates([]);
      setLoading(false);
      return;
    }
    setRentalStaffId(staffRow.id);
    const { data: taskRows, error } = await supabase
      .from("rental_staff_tasks" as never)
      .select("id, title, description, assigned_to, due, priority, done, created_at")
      .eq("assigned_to", staffRow.id)
      .order("due", { ascending: true });
    if (error) {
      setLoading(false);
      return;
    }
    const tRows = (taskRows ?? []) as unknown as TaskRow[];
    setRows(tRows);

    const ids = tRows.map((t) => t.id);
    if (ids.length > 0) {
      const { data: updateRows } = await supabase
        .from("rental_staff_task_updates" as never)
        .select("id, task_id, author_rental_staff_id, message, type, created_at")
        .in("task_id", ids)
        .order("created_at", { ascending: true });
      setUpdates((updateRows ?? []) as unknown as UpdateRow[]);
    } else {
      setUpdates([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!rentalStaffId) return;
    const channel = supabase
      .channel(`rental_tasks:${rentalStaffId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rental_staff_tasks" }, () => {
        void fetchAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rental_staff_task_updates" }, () => {
        void fetchAll();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [rentalStaffId, fetchAll]);

  const tasks = useMemo<Task[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description ?? undefined,
        assigneeId: r.assigned_to,
        due: r.due,
        priority: r.priority,
        done: r.done,
      })),
    [rows],
  );

  const updatesByTask = useMemo(() => {
    const m = new Map<string, RentalTaskUpdate[]>();
    for (const u of updates) {
      const list = m.get(u.task_id) ?? [];
      list.push({
        id: u.id,
        taskId: u.task_id,
        authorRentalStaffId: u.author_rental_staff_id,
        message: u.message,
        type: u.type,
        createdAt: u.created_at,
      });
      m.set(u.task_id, list);
    }
    return m;
  }, [updates]);

  const toggleTask = useCallback(
    async (id: string, done: boolean) => {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, done } : r)));
      const { error } = await (supabase.from("rental_staff_tasks" as never) as any)
        .update({ done })
        .eq("id", id);
      if (error) void fetchAll();
    },
    [fetchAll],
  );

  const addUpdate = useCallback(
    async (taskId: string, message: string, type: RentalTaskUpdate["type"] = "progress") => {
      if (!rentalStaffId) return;
      const { error } = await (supabase.from("rental_staff_task_updates" as never) as any).insert({
        task_id: taskId,
        author_rental_staff_id: rentalStaffId,
        message: message.trim(),
        type,
      });
      if (!error) await fetchAll();
    },
    [rentalStaffId, fetchAll],
  );

  return { rentalStaffId, tasks, loading, updatesByTask, toggleTask, addUpdate, refresh: fetchAll };
}
