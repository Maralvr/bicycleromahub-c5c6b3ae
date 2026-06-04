import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";
import { Attachment } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";

export type TaskUpdate = {
  id: string;
  taskId: string;
  authorStaffId: string;
  message: string;
  type: "progress" | "completed" | "blocker";
  createdAt: string; // ISO
  read: boolean; // read by admins
  attachments?: Attachment[];
};

type TaskUpdatesStore = {
  updates: TaskUpdate[];
  addUpdate: (u: Omit<TaskUpdate, "id" | "createdAt" | "read">) => void;
  updatesForTask: (taskId: string) => TaskUpdate[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
};

const Ctx = createContext<TaskUpdatesStore | null>(null);

type TaskUpdateRow = {
  id: string;
  task_id: string;
  author_staff_id: string;
  message: string;
  type: TaskUpdate["type"];
  created_at: string;
  read: boolean;
  attachments: Attachment[] | null;
};

const fromRow = (row: TaskUpdateRow): TaskUpdate => ({
  id: row.id,
  taskId: row.task_id,
  authorStaffId: row.author_staff_id,
  message: row.message,
  type: row.type,
  createdAt: row.created_at,
  read: row.read,
  attachments: row.attachments ?? undefined,
});

export function TaskUpdatesStoreProvider({ children }: { children: ReactNode }) {
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);

  const fetchUpdates = useCallback(async () => {
    const { data, error } = await supabase
      .from("task_updates")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setUpdates(((data ?? []) as TaskUpdateRow[]).map(fromRow));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const startRealtime = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);
      if (cancelled) return;

      void fetchUpdates();
      channel = supabase
        .channel(`task-updates-live-${data.session?.user?.id ?? "guest"}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "task_updates" }, (payload) => {
          const newRow = payload.new as TaskUpdateRow | null;
          const oldRow = payload.old as { id?: string } | null;
          if (payload.eventType === "INSERT" && newRow) {
            setUpdates((prev) =>
              prev.some((u) => u.id === newRow.id) ? prev : [fromRow(newRow), ...prev],
            );
          } else if (payload.eventType === "UPDATE" && newRow) {
            setUpdates((prev) => prev.map((u) => (u.id === newRow.id ? fromRow(newRow) : u)));
          } else if (payload.eventType === "DELETE" && oldRow?.id) {
            setUpdates((prev) => prev.filter((u) => u.id !== oldRow.id));
          }
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            void fetchUpdates();
          }
        });
    };

    void startRealtime();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
      void fetchUpdates();
    });

    const fallback = window.setInterval(() => void fetchUpdates(), 10000);

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      window.clearInterval(fallback);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [fetchUpdates]);

  const addUpdate: TaskUpdatesStore["addUpdate"] = useCallback(
    (u) => {
      void supabase
        .from("task_updates")
        .insert({
          task_id: u.taskId,
          author_staff_id: u.authorStaffId,
          message: u.message,
          type: u.type,
          attachments: u.attachments ?? [],
          read: false,
        })
        .then(({ error }) => {
          if (error) return;
          void fetchUpdates();
        });
    },
    [fetchUpdates],
  );

  const updatesForTask = useCallback(
    (taskId: string) => updates.filter((u) => u.taskId === taskId),
    [updates],
  );

  const markRead = useCallback((id: string) => {
    void supabase.from("task_updates").update({ read: true }).eq("id", id);
    setUpdates((prev) => prev.map((u) => (u.id === id ? { ...u, read: true } : u)));
  }, []);

  const markAllRead = useCallback(() => {
    void supabase.from("task_updates").update({ read: true }).eq("read", false);
    setUpdates((prev) => prev.map((u) => ({ ...u, read: true })));
  }, []);

  const unreadCount = updates.filter((u) => !u.read).length;

  return (
    <Ctx.Provider
      value={{ updates, addUpdate, updatesForTask, unreadCount, markRead, markAllRead }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTaskUpdates() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTaskUpdates must be used within TaskUpdatesStoreProvider");
  return ctx;
}
