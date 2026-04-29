import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { GuideNote, FieldUpdate, updates as initialUpdates } from "@/lib/mock-data";
import { staff as mockStaff } from "@/lib/mock-data";

export type GuideNotification = {
  id: string;
  staffId: string; // recipient
  type: "assigned" | "reassigned" | "unassigned" | "shift_updated" | "shift_cancelled" | "broadcast" | "reminder" | "task";
  title: string;
  body: string;
  shiftId?: string;
  link?: string;
  createdAt: string; // ISO
  read: boolean;
};

type NotesStore = {
  notesByShift: Record<string, GuideNote[]>;
  feed: FieldUpdate[];
  addNote: (note: GuideNote, tourName: string) => void;

  // guide notifications
  notifications: GuideNotification[];
  notifyGuide: (n: Omit<GuideNotification, "id" | "createdAt" | "read">) => void;
  notifyGuides: (staffIds: string[], n: Omit<GuideNotification, "id" | "createdAt" | "read" | "staffId">) => void;
  markRead: (id: string) => void;
  markAllRead: (staffId: string) => void;
  clearForGuide: (staffId: string) => void;
  unreadCountFor: (staffId: string) => number;
};

const NotesContext = createContext<NotesStore | null>(null);

const STORAGE_KEY = "ebr.guideNotes.v1";
const FEED_KEY = "ebr.activityFeed.v1";
const NOTIF_KEY = "ebr.guideNotifs.v1";

export function NotesStoreProvider({ children }: { children: ReactNode }) {
  const [notesByShift, setNotesByShift] = useState<Record<string, GuideNote[]>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
  });
  const [feed, setFeed] = useState<FieldUpdate[]>(() => {
    if (typeof window === "undefined") return initialUpdates;
    try {
      const stored = localStorage.getItem(FEED_KEY);
      return stored ? JSON.parse(stored) : initialUpdates;
    } catch { return initialUpdates; }
  });
  const [notifications, setNotifications] = useState<GuideNotification[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]"); } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notesByShift)); } catch {}
  }, [notesByShift]);
  useEffect(() => {
    try { localStorage.setItem(FEED_KEY, JSON.stringify(feed)); } catch {}
  }, [feed]);
  useEffect(() => {
    try { localStorage.setItem(NOTIF_KEY, JSON.stringify(notifications)); } catch {}
  }, [notifications]);

  // Cross-tab sync (simulates "live" updates from the backend)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === NOTIF_KEY && e.newValue) {
        try { setNotifications(JSON.parse(e.newValue)); } catch {}
      }
      if (e.key === FEED_KEY && e.newValue) {
        try { setFeed(JSON.parse(e.newValue)); } catch {}
      }
      if (e.key === STORAGE_KEY && e.newValue) {
        try { setNotesByShift(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addNote = (note: GuideNote, tourName: string) => {
    setNotesByShift((prev) => ({
      ...prev,
      [note.shiftId]: [...(prev[note.shiftId] || []), note],
    }));
    const author = mockStaff.find((s) => s.id === note.authorStaffId);
    const categoryLabel: Record<GuideNote["category"], string> = {
      general: "left a post-tour note",
      bike_issue: "reported a bike issue",
      customer: "left a customer note",
      incident: "reported an incident",
    };
    const update: FieldUpdate = {
      id: `u-${note.id}`,
      authorId: note.authorStaffId,
      message: `${author?.name || "Guide"} ${categoryLabel[note.category]} on "${tourName}": ${note.message}`,
      type: "field",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setFeed((prev) => [update, ...prev]);
  };

  const notifyGuide: NotesStore["notifyGuide"] = (n) => {
    setNotifications((prev) => [
      {
        ...n,
        id: `gn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);
  };

  const notifyGuides: NotesStore["notifyGuides"] = (staffIds, n) => {
    if (staffIds.length === 0) return;
    const stamp = Date.now();
    setNotifications((prev) => [
      ...staffIds.map((staffId, i) => ({
        ...n,
        staffId,
        id: `gn-${stamp}-${i}-${Math.random().toString(36).slice(2, 5)}`,
        createdAt: new Date().toISOString(),
        read: false,
      })),
      ...prev,
    ]);
  };

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = (staffId: string) => {
    setNotifications((prev) => prev.map((n) => (n.staffId === staffId ? { ...n, read: true } : n)));
  };

  const clearForGuide = (staffId: string) => {
    setNotifications((prev) => prev.filter((n) => n.staffId !== staffId));
  };

  const unreadCountFor = (staffId: string) => notifications.filter((n) => n.staffId === staffId && !n.read).length;

  return (
    <NotesContext.Provider value={{ notesByShift, feed, addNote, notifications, notifyGuide, notifyGuides, markRead, markAllRead, clearForGuide, unreadCountFor }}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotesStore() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotesStore must be used within NotesStoreProvider");
  return ctx;
}
