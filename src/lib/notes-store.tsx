import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { GuideNote, FieldUpdate, Attachment } from "@/lib/mock-data";
import { resolveNotificationLink } from "@/lib/notification-link";
import { supabase } from "@/integrations/supabase/client";
import { useStaffStore } from "@/lib/staff-store";
import { useAuth } from "@/lib/auth";
import { useCurrentUser } from "@/lib/current-user";
import { persistAttachments } from "@/lib/attachment-storage";

export type GuideNotification = {
  id: string;
  staffId: string;
  type:
    | "assigned"
    | "reassigned"
    | "unassigned"
    | "shift_updated"
    | "shift_cancelled"
    | "shift_accepted"
    | "shift_rejected"
    | "broadcast"
    | "reminder"
    | "task"
    | "no_show";
  title: string;
  body: string;
  shiftId?: string;
  link?: string;
  createdAt: string;
  read: boolean;
  archivedAt?: string;
  fieldUpdateId?: string;
  /** Only present once lazily loaded via loadNotificationAttachments(). */
  attachments?: Attachment[];
  /** Cheap count kept on the row so the list can badge without fetching bytes. */
  attachmentCount?: number;
};

type NotesStore = {
  notesByShift: Record<string, GuideNote[]>;
  feed: FieldUpdate[];
  addNote: (note: GuideNote, tourName: string) => void;
  addFieldUpdate: (
    update: Omit<FieldUpdate, "id" | "time">,
  ) => Promise<{ error: { message: string } | null }>;
  deleteFieldUpdate: (id: string) => Promise<{ error: { message: string } | null }>;
  notifications: GuideNotification[];
  notifyGuide: (n: Omit<GuideNotification, "id" | "createdAt" | "read">) => Promise<void>;
  notifyGuides: (
    staffIds: string[],
    n: Omit<GuideNotification, "id" | "createdAt" | "read" | "staffId">,
  ) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: (staffId: string) => Promise<void>;
  archiveNotification: (id: string) => Promise<void>;
  unarchiveNotification: (id: string) => Promise<void>;
  clearForGuide: (staffId: string) => void;
  unreadCountFor: (staffId: string) => number;
  /** Fetches the attachments column for a single notification, on demand. */
  loadNotificationAttachments: (id: string) => Promise<Attachment[]>;
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
  /** NEVER selected in list queries -- fetched per-notification on demand. */
  attachments?: Attachment[] | null;
  attachment_count?: number | null;
  read: boolean;
  created_at: string;
  archived_at?: string | null;
  field_update_id?: string | null;
};

// Cost fix: guide_notifications.attachments used to hold inline base64 blobs,
// so `select *` in the list/poll path pulled megabytes per notification.
// List queries select only what the list UI renders; attachments are loaded
// one notification at a time when the user expands it.
const NOTIFICATION_LIST_COLUMNS =
  "id, staff_id, type, title, body, shift_id, link, read, created_at, archived_at, field_update_id, attachment_count";

// Cost fix: guide_notes / field_updates used to be unbounded `select *` over
// every row ever written, re-run on every focus, reconnect and poll. Both are
// now explicit column lists bounded to a rolling window + hard row cap.
// `attachments` is kept here (unlike notifications) because both lists render
// their attachments inline, and post-Storage-migration the column only holds
// small path metadata rather than base64 bytes.
const LIST_WINDOW_DAYS = 90;
const GUIDE_NOTES_LIMIT = 500;
const FIELD_UPDATES_LIMIT = 200;
const NOTIFICATIONS_LIMIT = 200;
/** Admin/unfiltered view: never pull the whole table. */
const ADMIN_NOTIFICATIONS_LIMIT = 200;

const GUIDE_NOTE_LIST_COLUMNS =
  "id, shift_id, author_staff_id, message, category, created_at, attachments";
const FIELD_UPDATE_LIST_COLUMNS =
  "id, author_id, message, type, time, created_at, attachments";

const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();


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
  createdAt: row.created_at ?? undefined,
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
  attachmentCount: row.attachment_count ?? row.attachments?.length ?? 0,
  read: row.read,
  createdAt: row.created_at,
  archivedAt: row.archived_at ?? undefined,
  fieldUpdateId: row.field_update_id ?? undefined,
});

const applyLocalReadState = (
  notification: GuideNotification,
  locallyReadIds: Set<string>,
): GuideNotification =>
  locallyReadIds.has(notification.id) ? { ...notification, read: true } : notification;

export function NotesStoreProvider({ children }: { children: ReactNode }) {
  const { staff } = useStaffStore();
  const { user, profile } = useAuth();
  const { staffId: currentStaffId } = useCurrentUser();
  const myStaffId = useMemo(
    () =>
      currentStaffId ||
      profile?.staff_id ||
      (user ? (staff.find((s) => s.profileId === user.id)?.id ?? null) : null),
    [currentStaffId, profile?.staff_id, user, staff],
  );
  const [notesByShift, setNotesByShift] = useState<Record<string, GuideNote[]>>({});
  const [feed, setFeed] = useState<FieldUpdate[]>([]);
  const [notifications, setNotifications] = useState<GuideNotification[]>([]);
  const locallyReadNotificationIds = useRef(new Set<string>());

  const fetchNotes = useCallback(async () => {
    const { data, error } = await supabase
      .from("guide_notes")
      .select(GUIDE_NOTE_LIST_COLUMNS)
      .gte("created_at", isoDaysAgo(LIST_WINDOW_DAYS))
      .order("created_at", { ascending: false })
      .limit(GUIDE_NOTES_LIMIT);
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
      .select(FIELD_UPDATE_LIST_COLUMNS)
      .gte("created_at", isoDaysAgo(LIST_WINDOW_DAYS))
      .order("created_at", { ascending: false })
      .limit(FIELD_UPDATES_LIMIT);
    if (!error) {
      setFeed(((data ?? []) as FieldUpdateRow[]).map(fieldUpdateFromRow));
      return;
    }

    console.error("[notes] fetchFeed failed", error);
  }, []);

  const fetchNotifications = useCallback(async (staffId?: string | null) => {
    let query = supabase.from("guide_notifications").select(NOTIFICATION_LIST_COLUMNS);
    if (staffId) query = query.eq("staff_id", staffId);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(staffId ? NOTIFICATIONS_LIMIT : ADMIN_NOTIFICATIONS_LIMIT);
    if (!error) {
      setNotifications(
        ((data ?? []) as GuideNotificationRow[]).map((row) => {
          return applyLocalReadState(notificationFromRow(row), locallyReadNotificationIds.current);
        }),
      );
      return;
    }

    console.error("[notes] fetchNotifications failed", error);
  }, []);


  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const loadInitial = () => {
      void fetchNotes();
      void fetchFeed();
    };

    const startRealtime = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);
      if (cancelled) return;

      loadInitial();
      channel = supabase
        .channel(
          `notes-feed-live-${data.session?.user?.id ?? "guest"}-${Math.random().toString(36).slice(2)}`,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "guide_notes" },
          (payload) => {
            const newRow = payload.new as GuideNoteRow | null;
            const oldRow = payload.old as { id?: string; shift_id?: string } | null;
            if (payload.eventType === "INSERT" && newRow) {
              const note = noteFromRow(newRow);
              setNotesByShift((prev) => {
                const existing = prev[note.shiftId] ?? [];
                if (existing.some((n) => n.id === note.id)) return prev;
                return { ...prev, [note.shiftId]: [note, ...existing] };
              });
            } else if (payload.eventType === "UPDATE" && newRow) {
              const note = noteFromRow(newRow);
              setNotesByShift((prev) => ({
                ...prev,
                [note.shiftId]: (prev[note.shiftId] ?? []).map((n) =>
                  n.id === note.id ? note : n,
                ),
              }));
            } else if (payload.eventType === "DELETE" && oldRow?.id) {
              setNotesByShift((prev) => {
                const next: Record<string, GuideNote[]> = {};
                for (const [k, v] of Object.entries(prev)) {
                  next[k] = v.filter((n) => n.id !== oldRow.id);
                }
                return next;
              });
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "field_updates" },
          (payload) => {
            const newRow = payload.new as FieldUpdateRow | null;
            const oldRow = payload.old as { id?: string } | null;
            if (payload.eventType === "INSERT" && newRow) {
              const u = fieldUpdateFromRow(newRow);
              setFeed((prev) => (prev.some((x) => x.id === u.id) ? prev : [u, ...prev]));
            } else if (payload.eventType === "UPDATE" && newRow) {
              const u = fieldUpdateFromRow(newRow);
              setFeed((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            } else if (payload.eventType === "DELETE" && oldRow?.id) {
              setFeed((prev) => prev.filter((x) => x.id !== oldRow.id));
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            loadInitial();
          }
        });
    };

    void startRealtime();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
      loadInitial();
    });

    // Realtime is the primary sync path; this is only a safety net for a
    // silently dropped socket. 10s polling was a major read-cost driver.
    const fallback = window.setInterval(loadInitial, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      window.clearInterval(fallback);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [fetchFeed, fetchNotes, user?.id]);

  // Separate channel for guide_notifications, filtered to just this user's
  // staff row so each client only receives its own notifications.
  useEffect(() => {
    if (!myStaffId) {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let fallback: number | null = null;

    const startRealtime = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || cancelled) return;

      await supabase.realtime.setAuth(token);
      if (cancelled) return;

      await fetchNotifications(myStaffId);
      if (cancelled) return;
      channel = supabase
        .channel(`guide-notifications-${myStaffId}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "guide_notifications",
          },
          (payload) => {
            const raw = payload.new as GuideNotificationRow | null;
            // Realtime delivers the whole row; drop the heavy column so we
            // never hold attachment bytes in the list state.
            const newRow = raw
              ? ({
                  ...raw,
                  attachments: undefined,
                  attachment_count:
                    raw.attachment_count ?? (raw.attachments?.length ?? 0),
                } as GuideNotificationRow)
              : null;
            const oldRow = payload.old as { id?: string } | null;
            if (payload.eventType === "INSERT" && newRow) {
              if (newRow.staff_id !== myStaffId) return;
              const n = applyLocalReadState(
                notificationFromRow(newRow),
                locallyReadNotificationIds.current,
              );
              setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
            } else if (payload.eventType === "UPDATE" && newRow) {
              if (newRow.staff_id !== myStaffId) return;
              const n = applyLocalReadState(
                notificationFromRow(newRow),
                locallyReadNotificationIds.current,
              );
              setNotifications((prev) => prev.map((x) => (x.id === n.id ? n : x)));
            } else if (payload.eventType === "DELETE" && oldRow?.id) {
              setNotifications((prev) => prev.filter((x) => x.id !== oldRow.id));
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            void fetchNotifications(myStaffId);
          }
        });

      // Safety net only -- notifications arrive over realtime.
      fallback = window.setInterval(() => {
        void fetchNotifications(myStaffId);
      }, 5 * 60 * 1000);
    };

    void startRealtime();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
      void fetchNotifications(myStaffId);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      if (fallback) window.clearInterval(fallback);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [fetchNotifications, myStaffId]);

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

      void (async () => {
        const attachments = await persistAttachments(note.attachments);
        await supabase.from("guide_notes").insert({
          id: note.id,
          shift_id: note.shiftId,
          author_staff_id: note.authorStaffId,
          message: note.message,
          category: note.category,
          attachments,
        });
        await supabase.from("field_updates").insert({
          author_id: note.authorStaffId,
          message,
          type: "field",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          attachments,
        });
      })();
    },
    [staff],
  );

  const notifyGuide: NotesStore["notifyGuide"] = useCallback(async (n) => {
    const uploaded = await persistAttachments(n.attachments);
    // Store a deep link (e.g. /shifts?shift=<id>) instead of a bare list URL
    // so clicking the notification opens the booking it is about.
    const deepLink = resolveNotificationLink({ link: n.link, shiftId: n.shiftId });
    const { error } = await supabase.from("guide_notifications").insert({
      staff_id: n.staffId,
      type: n.type,
      title: n.title,
      body: n.body,
      shift_id: n.shiftId ?? null,
      link: deepLink,
      attachments: uploaded,
      read: false,
    });
    if (error) {
      console.error("[notifyGuide] insert failed", error);
      return;
    }
    // Fire-and-forget push (server fn; auth-required, errors are swallowed).
    void (async () => {
      try {
        const { sendPushForNotification } = await import("@/lib/push.functions");
        await sendPushForNotification({ data: { staffIds: [n.staffId], title: n.title, body: n.body, url: deepLink ?? "/notifications" } });
      } catch (e) {
        console.warn("[notifyGuide] push failed (non-fatal)", e);
      }
    })();
  }, []);

  const addFieldUpdate: NotesStore["addFieldUpdate"] = useCallback(async (update) => {
    const uploaded = await persistAttachments(update.attachments);
    const { error } = await supabase.from("field_updates").insert({
      author_id: update.authorId,
      message: update.message,
      type: update.type,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      attachments: uploaded,
    });
    return { error: error ? { message: error.message } : null };
  }, []);

  const notifyGuides: NotesStore["notifyGuides"] = useCallback(async (staffIds, n) => {
    if (staffIds.length === 0) return;
    const uploaded = await persistAttachments(n.attachments);
    const deepLink = resolveNotificationLink({ link: n.link, shiftId: n.shiftId });
    const { error } = await supabase.from("guide_notifications").insert(
      staffIds.map((staffId) => ({
        staff_id: staffId,
        type: n.type,
        title: n.title,
        body: n.body,
        shift_id: n.shiftId ?? null,
        link: deepLink,
        attachments: uploaded,
        field_update_id: n.fieldUpdateId ?? null,
        read: false,
      })),
    );
    if (error) {
      console.error("[notifyGuides] insert failed", error);
      return;
    }
    void (async () => {
      try {
        const { sendPushForNotification } = await import("@/lib/push.functions");
        await sendPushForNotification({ data: { staffIds, title: n.title, body: n.body, url: deepLink ?? "/notifications" } });
      } catch (e) {
        console.warn("[notifyGuides] push failed (non-fatal)", e);
      }
    })();
  }, []);

  const markRead = useCallback(async (id: string) => {
    locallyReadNotificationIds.current.add(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));

    const { error } = await supabase
      .from("guide_notifications")
      .update({ read: true })
      .eq("id", id);
    if (error) console.error("[markRead] failed", error);
  }, []);

  const markAllRead = useCallback(async (staffId: string) => {
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.staffId !== staffId || n.archivedAt) return n;
        locallyReadNotificationIds.current.add(n.id);
        return { ...n, read: true };
      }),
    );

    const { data, error } = await supabase
      .from("guide_notifications")
      .update({ read: true })
      .eq("staff_id", staffId)
      .is("archived_at", null)
      .select("id");
    if (error) {
      console.error("[markAllRead] failed", error);
      return;
    }
    for (const row of data ?? []) locallyReadNotificationIds.current.add(row.id);
  }, []);

  const archiveNotification = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("guide_notifications")
      .update({ archived_at: now, read: true })
      .eq("id", id);
    if (error) {
      console.error("[archiveNotification] failed", error);
      return;
    }
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, archivedAt: now, read: true } : n)),
    );
  }, []);

  const unarchiveNotification = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("guide_notifications")
      .update({ archived_at: null })
      .eq("id", id);
    if (error) {
      console.error("[unarchiveNotification] failed", error);
      return;
    }
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, archivedAt: undefined } : n)),
    );
  }, []);

  const deleteFieldUpdate: NotesStore["deleteFieldUpdate"] = useCallback(async (id) => {
    // Cascade: remove all notifications that referenced this broadcast
    await supabase.from("guide_notifications").delete().eq("field_update_id", id);
    const { error } = await supabase.from("field_updates").delete().eq("id", id);
    if (!error) {
      setFeed((prev) => prev.filter((u) => u.id !== id));
      setNotifications((prev) => prev.filter((n) => n.fieldUpdateId !== id));
    }
    return { error: error ? { message: error.message } : null };
  }, []);

  const clearForGuide = useCallback((staffId: string) => {
    void supabase.from("guide_notifications").delete().eq("staff_id", staffId);
    setNotifications((prev) => prev.filter((n) => n.staffId !== staffId));
  }, []);

  const loadNotificationAttachments = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("guide_notifications")
      .select("attachments")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("[loadNotificationAttachments] failed", error);
      return [];
    }
    const attachments = ((data as { attachments: Attachment[] | null }).attachments ??
      []) as Attachment[];
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, attachments, attachmentCount: attachments.length } : n)),
    );
    return attachments;
  }, []);

  const unreadCountFor = (staffId: string) =>
    notifications.filter((n) => n.staffId === staffId && !n.read && !n.archivedAt).length;

  return (
    <NotesContext.Provider
      value={{
        notesByShift,
        feed,
        addNote,
        addFieldUpdate,
        deleteFieldUpdate,
        loadNotificationAttachments,
        notifications,
        notifyGuide,
        notifyGuides,
        markRead,
        markAllRead,
        archiveNotification,
        unarchiveNotification,
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
