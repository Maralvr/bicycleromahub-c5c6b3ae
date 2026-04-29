import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";
import { Attachment } from "@/lib/mock-data";

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
const KEY = "ebr.taskUpdates.v1";

export function TaskUpdatesStoreProvider({ children }: { children: ReactNode }) {
  const [updates, setUpdates] = useState<TaskUpdate[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(updates)); } catch {}
  }, [updates]);

  // live cross-tab sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try { setUpdates(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addUpdate: TaskUpdatesStore["addUpdate"] = useCallback((u) => {
    setUpdates((prev) => [
      {
        ...u,
        id: `tu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);
  }, []);

  const updatesForTask = useCallback(
    (taskId: string) => updates.filter((u) => u.taskId === taskId),
    [updates],
  );

  const markRead = useCallback((id: string) => {
    setUpdates((prev) => prev.map((u) => (u.id === id ? { ...u, read: true } : u)));
  }, []);

  const markAllRead = useCallback(() => {
    setUpdates((prev) => prev.map((u) => ({ ...u, read: true })));
  }, []);

  const unreadCount = updates.filter((u) => !u.read).length;

  return (
    <Ctx.Provider value={{ updates, addUpdate, updatesForTask, unreadCount, markRead, markAllRead }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTaskUpdates() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTaskUpdates must be used within TaskUpdatesStoreProvider");
  return ctx;
}
