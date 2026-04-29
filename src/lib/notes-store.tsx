import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";
import { GuideNote, FieldUpdate, Attachment } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { useStaffStore } from "@/lib/staff-store";

export type GuideNotification = {
  id: string;
  staffId: string;
  type:
    | "assigned"
    | "reassigned"
    | "unassigned"
    | "shift_updated"
    | "shift_cancelled"
    | "broadcast"
    | "reminder"
    | "task";
  title: string;
  body: string;
  shiftId?: string;
  link?: string;
  createdAt: string;
  read: boolean;
  attachments?: Attachment[];
};

type NotesStore = {
  notesByShift: Record<string, GuideNote[]>;
  feed: FieldUpdate[];
  addNote: (note: GuideNote, tourName: string) => void;
  addFieldUpdate: (update: Omit<FieldUpdate, "id" | "time">) => void;
  notifications: GuideNotification[];
  notifyGuide: (n: Omit<GuideNotification, "id" | "createdAt" | "read">) => void;
  notifyGuides: (
    staffIds: string[],
    n: Omit<GuideNotification, "id" | "createdAt" | "read" | "staffId">,
  ) => void;
  markRead: (id: string) => void;
  markAllRead: (staffId: string) => void;
  clearForGuide: (staffId: string) => void;
  unreadCountFor: (staffId: string) => number;
};

type GuideNoteRow = {
  id: string;
  shift_id: string;
  author_staff_id: string;
  message: string;
  category: GuideNote["category"];
  created_at: string;
  attachments: Attachment[] | null;
};

type FieldUpdateRow = {
  id: string;
  author_id: string;
  message: string;
  type: FieldUpdate["type"];
  time: string | null;
  created_at?: string | null;
  attachments: Attachment[] | null;
};

type GuideNotificationRow = {
  id: string;
  staff_id: string;
  type: GuideNotification["type"];
  title: string;
  body: string;
  shift_id: string | null;
  link: string | null;
  attachments: Attachment[] | null;
  read: boolean;
  created_at: string;
};

const NotesContext = createContext<NotesStore | null>(null);

const noteFromRow = (row: GuideNoteRow): GuideNote => ({
  id: row.id,
  shiftId: row.shift_id,
  authorStaffId: row.author_staff_id,
  message: row.message,
  category: row.category,
  createdAt: row.created_at,
  attachments: row.attachments ?? undefined,
});

const fieldUpdateFromRow = (row: FieldUpdateRow): FieldUpdate => ({
  id: row.id,
  authorId: row.author_id,
  message: row.message,
  type: row.type,
  time:
    row.time ??
    (row.created_at
      ? new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : ""),
  attachments: row.attachments ?? undefined,
});

const notificationFromRow = (row: GuideNotificationRow): GuideNotification => ({
  id: row.id,
  staffId: row.staff_id,
  type: row.type,
  title: row.title,
  body: row.body,
  shiftId: row.shift_id ?? undefined,
  link: row.link ?? undefined,
  attachments: row.attachments ?? undefined,
  read: row.read,
  createdAt: row.created_at,
});

export function NotesStoreProvider({ children }: { children: ReactNode }) {
  const { staff } = useStaffStore();
  const [notesByShift, setNotesByShift] = useState<Record<string, GuideNote[]>>({});
  const [feed, setFeed] = useState<FieldUpdate[]>([]);
  const [notifications, setNotifications] = useState<GuideNotification[]>([]);

  const fetchNotes = useCallback(async () => {
    const { data, error } = await supabase
      .from("guide_notes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return;
    const grouped: Record<string, GuideNote[]> = {};
    for (const note of ((data ?? []) as GuideNoteRow[]).map(noteFromRow)) {
      grouped[note.shiftId] = [...(grouped[note.shiftId] ?? []), note];
    }
    setNotesByShift(grouped);
  }, []);

  const fetchFeed = useCallback(async () => {
    const { data, error } = await supabase
      .from("field_updates")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setFeed(((data ?? []) as FieldUpdateRow[]).map(fieldUpdateFromRow));
  }, []);

  const fetchNotifications = useCallback(async () => {
    const { data, error } = await supabase
      .from("guide_notifications")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setNotifications(((data ?? []) as GuideNotificationRow[]).map(notificationFromRow));
  }, []);

  useEffect(() => {
    void fetchNotes();
    void fetchFeed();
    void fetchNotifications();

    const channel = supabase
      .channel("notes-notifications-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "guide_notes" }, () => {
        void fetchNotes();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "field_updates" }, () => {
        void fetchFeed();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guide_notifications" },
        () => {
          void fetchNotifications();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchFeed, fetchNotes, fetchNotifications]);

  const addNote = useCallback<NotesStore["addNote"]>(
    (note, tourName) => {
      const author = staff.find((s) => s.id === note.authorStaffId);
      const categoryLabel: Record<GuideNote["category"], string> = {
        general: "left a post-tour note",
        bike_issue: "reported a bike issue",
        customer: "left a customer note",
        incident: "reported an incident",
      };
      const message = `${author?.name || "Guide"} ${categoryLabel[note.category]} on "${tourName}": ${note.message}`;

      void supabase.from("guide_notes").insert({
        id: note.id,
        shift_id: note.shiftId,
        author_staff_id: note.authorStaffId,
        message: note.message,
        category: note.category,
        attachments: note.attachments ?? [],
      });
      void supabase.from("field_updates").insert({
        author_id: note.authorStaffId,
        message,
        type: "field",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        attachments: note.attachments ?? [],
      });
    },
    [staff],
  );

  const notifyGuide: NotesStore["notifyGuide"] = useCallback((n) => {
    void supabase.from("guide_notifications").insert({
      staff_id: n.staffId,
      type: n.type,
      title: n.title,
      body: n.body,
      shift_id: n.shiftId ?? null,
      link: n.link ?? null,
      attachments: n.attachments ?? [],
      read: false,
    });
  }, []);

  const addFieldUpdate: NotesStore["addFieldUpdate"] = useCallback((update) => {
    void supabase.from("field_updates").insert({
      author_id: update.authorId,
      message: update.message,
      type: update.type,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      attachments: update.attachments ?? [],
    });
  }, []);

  const notifyGuides: NotesStore["notifyGuides"] = useCallback((staffIds, n) => {
    if (staffIds.length === 0) return;
    void supabase.from("guide_notifications").insert(
      staffIds.map((staffId) => ({
        staff_id: staffId,
        type: n.type,
        title: n.title,
        body: n.body,
        shift_id: n.shiftId ?? null,
        link: n.link ?? null,
        attachments: n.attachments ?? [],
        read: false,
      })),
    );
  }, []);

  const markRead = useCallback((id: string) => {
    void supabase.from("guide_notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback((staffId: string) => {
    void supabase.from("guide_notifications").update({ read: true }).eq("staff_id", staffId);
    setNotifications((prev) => prev.map((n) => (n.staffId === staffId ? { ...n, read: true } : n)));
  }, []);

  const clearForGuide = useCallback((staffId: string) => {
    void supabase.from("guide_notifications").delete().eq("staff_id", staffId);
    setNotifications((prev) => prev.filter((n) => n.staffId !== staffId));
  }, []);

  const unreadCountFor = (staffId: string) =>
    notifications.filter((n) => n.staffId === staffId && !n.read).length;

  return (
    <NotesContext.Provider
      value={{
        notesByShift,
        feed,
        addNote,
        addFieldUpdate,
        notifications,
        notifyGuide,
        notifyGuides,
        markRead,
        markAllRead,
        clearForGuide,
        unreadCountFor,
      }}
    >
      {children}
    </NotesContext.Provider>
  );
}

export function useNotesStore() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotesStore must be used within NotesStoreProvider");
  return ctx;
}
