import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/current-user";
import { useStaffStore } from "@/lib/staff-store";
import { Attachment } from "@/lib/mock-data";
import { useNotesStore } from "@/lib/notes-store";
import { BroadcastInteractions } from "@/components/broadcast-interactions";
import { BroadcastInteractionsProvider } from "@/lib/broadcast-interactions-store";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { listMyRentalNotifications, markRentalNotificationRead } from "@/lib/rental-staff.functions";
import {
  processFiles,
  DEFAULT_MAX_FILES,
  DEFAULT_MAX_SIZE,
  AttachmentList,
} from "@/components/attachment-picker";
import { PushToggle } from "@/components/push-toggle";
import {
  Send,
  Megaphone,
  MapPin,
  Sparkles,
  Bell,
  CheckCheck,
  CalendarRange,
  AlertTriangle,
  X,
  ListChecks,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Download,
  Loader2,
  ChevronDown,
  Ban,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Bicycle Roma" },
      { name: "description", content: "Broadcast messages and live field updates from guides." },
    ],
  }),
  component: NotificationsPageRouter,
});

function NotificationsPageRouter() {
  // Rental staff notifications live in a separate table
  // (rental_staff_notifications, keyed by rental_staff_id) from the guide
  // notifications this page otherwise reads via useNotesStore() -- and none
  // of the providers that depends on (CurrentUserProvider, StaffStoreProvider,
  // etc.) are mounted for rental-staff-only sessions (see
  // AuthenticatedDataProviders in __root.tsx). Branch before any of that runs.
  const { isRentalStaff, isAuthenticated, loading, rolesLoaded } = useAuth();
  if (loading || !isAuthenticated || !rolesLoaded) return null;
  if (isRentalStaff) return <RentalStaffNotificationsView />;
  return (
    <BroadcastInteractionsProvider>
      <NotificationsPage />
    </BroadcastInteractionsProvider>
  );
}

type RentalNotif = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
  rental_point_id: string | null;
  date: string | null;
};

function rentalNotifTimeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function RentalStaffNotificationsView() {
  const list = useServerFn(listMyRentalNotifications);
  const mark = useServerFn(markRentalNotificationRead);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<RentalNotif[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await list();
      setItems(r.notifications as RentalNotif[]);
    } finally {
      setLoading(false);
    }
  }, [list]);

  useEffect(() => {
    void refresh();
    if (!user) return;
    const ch = supabase
      .channel(`rental_notif_page:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rental_staff_notifications" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, refresh]);

  const unread = items.filter((n) => !n.read).length;

  return (
    <AppShell>
      <PageHeader
        title="Notifications"
        subtitle="Updates about your rental-point day assignments."
        actions={
          unread > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await mark({ data: { all: true } });
                await refresh();
              }}
            >
              Mark all read
            </Button>
          ) : undefined
        }
      />
      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center border-dashed text-sm text-muted-foreground">
          No notifications yet.
        </Card>
      ) : (
        <div className="divide-y divide-border/40 rounded-lg border border-border/60 bg-card overflow-hidden">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={async () => {
                if (!n.read) {
                  await mark({ data: { id: n.id } });
                  await refresh();
                }
                if (n.link) {
                  // Preserve the query string (e.g. ?rental_day=<id>) instead
                  // of discarding it -- rental_staff_notifications links
                  // point at a specific day assignment, and dropping the
                  // param meant clicking a notification always just landed
                  // on the generic "My rental days" list.
                  try {
                    const url = new URL(n.link, window.location.origin);
                    const search = Object.fromEntries(url.searchParams);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    navigate({ to: url.pathname as any, search: search as any });
                  } catch {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    navigate({ to: n.link.split("?")[0] as any, search: {} as any });
                  }
                }
              }}
              className={`w-full text-left p-4 hover:bg-accent/50 transition-colors flex items-start gap-3 ${
                !n.read ? "bg-primary/5" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">{n.title}</div>
                <div className="text-sm text-muted-foreground mt-0.5">{n.body}</div>
                <div className="text-xs text-muted-foreground mt-1">{rentalNotifTimeAgo(n.created_at)}</div>
              </div>
              {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
            </button>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function NotificationsPage() {
  const { t } = useI18n();
  const { role, staffId } = useCurrentUser();
  const { staff } = useStaffStore();
  const isAdmin = role === "admin";
  const navigate = useNavigate();
  const { feed, notifications, markAllRead, markRead, archiveNotification, unarchiveNotification, deleteFieldUpdate, loadNotificationAttachments } = useNotesStore();
  const myNotifs = notifications.filter((n) => n.staffId === staffId);
  const myActiveNotifs = myNotifs.filter((n) => !n.archivedAt);
  const myArchivedNotifs = myNotifs.filter((n) => n.archivedAt);
  const unread = myActiveNotifs.filter((n) => !n.read).length;
  // Guides only see broadcasts (sent to everyone) or their own field updates.
  const updates = isAdmin
    ? feed
    : feed.filter((u) => u.type === "broadcast" || u.authorId === staffId);
  const [msg, setMsg] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedNotif, setExpandedNotif] = useState<string | null>(null);
  const [expandedFeed, setExpandedFeed] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [broadcastGroup, setBroadcastGroup] = useState<"all" | "day" | "week" | "month">("all");
  const toggleFeed = (id: string) =>
    setExpandedFeed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const next = await processFiles(files, {
        maxFiles: DEFAULT_MAX_FILES,
        maxSize: DEFAULT_MAX_SIZE,
        existingCount: attachments.length,
      });
      if (next.length) setAttachments((prev) => [...prev, ...next]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  const attachmentsForNotification = (notificationId: string, body: string) => {
    const notification = notifications.find((n) => n.id === notificationId);
    if (notification?.attachments?.length) return notification.attachments;
    const matchingBroadcast = feed.find(
      (u) => u.type === "broadcast" && u.message === body && u.attachments?.length,
    );
    return matchingBroadcast?.attachments ?? [];
  };

  const send = async () => {
    if (!msg.trim() && attachments.length === 0) return;
    const message =
      msg ||
      (attachments.length === 1
        ? `Shared ${attachments[0].name}`
        : `Shared ${attachments.length} files`);

    try {
      // Broadcast goes to every active person in the team.
      const recipientIds = staff
        .filter((s) => s.active !== false)
        .map((s) => s.id);
      if (recipientIds.length === 0) {
        toast.error("No active staff to notify");
        return;
      }

      // Lightweight attachment metadata for notifications (no base64 payload).
      // Full attachments live once in the field_updates row below.
      const attachmentMeta = attachments.map((a) => ({
        id: a.id,
        name: a.name,
        mime: a.mime,
        size: a.size,
      }));

      if (!staffId) {
        toast.error("Couldn't send broadcast", { description: "No sender profile is selected." });
        return;
      }

      const { data: fuInserted, error: fuErr } = await supabase
        .from("field_updates")
        .insert({
          author_id: staffId,
          message,
          type: "broadcast",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          attachments: attachments.length ? attachments : [],
        })
        .select("id")
        .single();
      if (fuErr || !fuInserted) {
        toast.error("Couldn't post broadcast", { description: fuErr?.message ?? "Unknown error" });
        return;
      }

      const { error: notifErr } = await supabase.from("guide_notifications").insert(
        recipientIds.map((rid: string) => ({
          staff_id: rid,
          type: "broadcast" as const,
          title: "Broadcast from admins",
          body: message,
          link: "/notifications",
          attachments: attachmentMeta,
          field_update_id: fuInserted.id,
          read: false,
        })),
      );
      if (notifErr) {
        toast.error("Couldn't send broadcast", { description: notifErr.message });
        return;
      }

      setMsg("");
      setAttachments([]);
      toast.success(`Broadcast sent to ${recipientIds.length} ${recipientIds.length === 1 ? "person" : "people"}`, {
        description: "They'll see it in their notification bell.",
      });
    } catch (err) {
      console.error("[broadcast] send failed", err);
      toast.error("Couldn't send broadcast", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };


  return (
    <AppShell>
      <PageHeader title={t.notifications.title} subtitle={t.notifications.subtitle} actions={<PushToggle />} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {isAdmin ? (
          <Card className="p-5 lg:col-span-1 h-fit border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card relative overflow-hidden lg:sticky lg:top-6">
            <div className="absolute -top-4 -right-4 h-24 w-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center gap-2.5 mb-3 relative">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground flex items-center justify-center shadow-[var(--shadow-elegant)]">
                <Megaphone className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold leading-tight">{t.notifications.broadcast}</h2>
                <div className="text-xs text-muted-foreground">
                  Reaches {staff.filter((s) => s.active !== false).length} team members
                </div>
              </div>
            </div>
            <Textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder={t.notifications.placeholder}
              rows={5}
              className="mb-3 resize-none bg-card relative"
            />
            {attachments.length > 0 && (
              <div className="mb-3 space-y-1.5 relative">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 p-2 rounded-md border border-border/60 bg-card text-xs"
                  >
                    {a.mime.startsWith("image/") ? (
                      <img src={a.dataUrl} alt={a.name} className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{a.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {(a.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => removeAttachment(a.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
            <div className="flex gap-2 relative">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0"
                title="Attach files"
                disabled={uploading || attachments.length >= DEFAULT_MAX_FILES}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </Button>
              <Button
                onClick={send}
                className="flex-1 shadow-[var(--shadow-elegant)]"
                disabled={!msg.trim() && attachments.length === 0}
              >
                <Send className="h-4 w-4 mr-2" /> {t.notifications.sendMessage}
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground mt-3 flex items-center gap-1 relative">
              <Sparkles className="h-3 w-3 text-primary" />
              {attachments.length}/{DEFAULT_MAX_FILES} files · max{" "}
              {(DEFAULT_MAX_SIZE / 1024 / 1024).toFixed(0)}MB · images auto-compressed
            </div>
          </Card>
        ) : (
          <Card className="p-5 lg:col-span-1 h-fit border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card relative overflow-hidden lg:sticky lg:top-6">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground flex items-center justify-center shadow-[var(--shadow-elegant)]">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold leading-tight">My notifications</h2>
                  <div className="text-xs text-muted-foreground">
                    {unread > 0 ? `${unread} unread` : "All caught up"}
                  </div>
                </div>
              </div>
              {unread > 0 && staffId && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => markAllRead(staffId)}
                >
                  <CheckCheck className="h-3.5 w-3.5 mr-1" /> Read all
                </Button>
              )}
            </div>
            <div className="mb-3 flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setShowArchived(false)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${!showArchived ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                Active ({myActiveNotifs.length})
              </button>
              <button
                type="button"
                onClick={() => setShowArchived(true)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${showArchived ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                Archived ({myArchivedNotifs.length})
              </button>
            </div>
            {(showArchived ? myArchivedNotifs : myActiveNotifs).length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-6 text-center">
                {showArchived
                  ? "Nothing archived yet."
                  : "You'll see schedule changes, broadcasts and updates here."}
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {(showArchived ? myArchivedNotifs : myActiveNotifs).slice(0, 50).map((n) => {
                  const Icon =
                    n.type === "broadcast"
                      ? Megaphone
                      : n.type === "shift_cancelled"
                        ? AlertTriangle
                        : n.type === "unassigned"
                          ? X
                          : n.type === "task"
                            ? ListChecks
                            : n.type === "no_show"
                              ? Ban
                              : CalendarRange;
                  const isOpen = expandedNotif === n.id;
                  const visibleAttachments = attachmentsForNotification(n.id, n.body);
                  return (
                    <div
                      key={n.id}
                      className={`rounded-lg border text-xs transition-colors ${n.archivedAt ? "bg-muted/40 border-border/60 opacity-80" : n.read ? "bg-card border-border/60" : "bg-primary/5 border-primary/30"}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!n.read) markRead(n.id);
                          if (n.link) {
                            try {
                              const url = new URL(n.link as string, window.location.origin);
                              const search = Object.fromEntries(url.searchParams);
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              navigate({ to: url.pathname as any, search: search as any });
                            } catch {
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              navigate({ to: n.link as any });
                            }
                            return;
                          }
                          if (!isOpen && (n.attachmentCount ?? 0) > 0 && !n.attachments) {
                            void loadNotificationAttachments(n.id);
                          }
                          setExpandedNotif(isOpen ? null : n.id);
                        }}
                        className="w-full text-left p-2.5"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className="h-3 w-3 text-primary" />
                          <span className="font-semibold text-foreground">{n.title}</span>
                          {!n.read && !n.archivedAt && (
                            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                          )}
                          <ChevronDown
                            className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""} ${n.read || n.archivedAt ? "ml-auto" : ""}`}
                          />
                        </div>
                        <div className={`text-muted-foreground ${isOpen ? "" : "line-clamp-2"}`}>
                          {n.body}
                        </div>
                        {!isOpen && (n.attachmentCount ?? visibleAttachments.length) > 0 && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-primary">
                            <Paperclip className="h-2.5 w-2.5" />
                            {n.attachmentCount || visibleAttachments.length} attachment
                            {(n.attachmentCount || visibleAttachments.length) > 1 ? "s" : ""}
                          </div>
                        )}
                      </button>
                      {isOpen && visibleAttachments.length > 0 && (
                        <div className="px-2.5 pb-2.5">
                          <AttachmentList attachments={visibleAttachments} />
                        </div>
                      )}
                      <div className="px-2.5 pb-2.5 flex items-center gap-2 flex-wrap">
                        {isOpen && n.link && (
                          <Link
                            to={n.link as string}
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                          >
                            Open <ChevronDown className="h-3 w-3 -rotate-90" />
                          </Link>
                        )}
                        {n.archivedAt ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void unarchiveNotification(n.id);
                            }}
                            className="ml-auto text-[11px] text-primary hover:underline"
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void archiveNotification(n.id);
                            }}
                            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="font-semibold">Activity feed</h2>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> Live
            </span>
          </div>
          <div className="mb-5 flex items-center gap-1.5 text-[11px] flex-wrap">
            <span className="text-muted-foreground mr-1">Group broadcasts:</span>
            {(["all", "day", "week", "month"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setBroadcastGroup(g)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${broadcastGroup === g ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {g === "all" ? "All" : g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
          <div className="relative">
            <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-5">
              {(() => {
                // Group broadcasts by selected granularity; field updates stay inline.
                const groups: Array<{ key: string; label: string | null; items: typeof updates }> = [];
                if (broadcastGroup === "all") {
                  groups.push({ key: "all", label: null, items: updates });
                } else {
                  const bucket = (iso: string) => {
                    const d = new Date(iso);
                    if (broadcastGroup === "day") return d.toISOString().slice(0, 10);
                    if (broadcastGroup === "month") return d.toISOString().slice(0, 7);
                    // week: ISO year-week
                    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                    const dayNum = tmp.getUTCDay() || 7;
                    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
                    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
                    const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
                    return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
                  };
                  const labelFor = (key: string, sample: string) => {
                    const d = new Date(sample);
                    if (broadcastGroup === "day")
                      return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
                    if (broadcastGroup === "month")
                      return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
                    return `Week of ${new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
                  };
                  const broadcastIso = (u: (typeof updates)[number]) =>
                    u.createdAt ?? new Date().toISOString();
                  // Field updates remain in their own "Recent" bucket; broadcasts get grouped.
                  const broadcasts = updates.filter((u) => u.type === "broadcast");
                  const fields = updates.filter((u) => u.type !== "broadcast");
                  const map = new Map<string, typeof updates>();
                  for (const u of broadcasts) {
                    const key = bucket(broadcastIso(u));
                    if (!map.has(key)) map.set(key, []);
                    map.get(key)!.push(u);
                  }
                  for (const [key, items] of map.entries()) {
                    groups.push({ key, label: labelFor(key, broadcastIso(items[0])), items });
                  }
                  if (fields.length) groups.push({ key: "field", label: "Field updates", items: fields });
                }
                return groups.map((group) => (
                  <div key={group.key} className="space-y-5">
                    {group.label && (
                      <div className="ml-12 -mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.label} · {group.items.length}
                      </div>
                    )}
                    {group.items.map((u) => {
                      const author = staff.find((s) => s.id === u.authorId);
                      const isLong = u.message.length > 180;
                      const isOpen = expandedFeed.has(u.id);
                      const isMine = u.authorId === staffId || isAdmin;
                      const canDelete = u.type === "broadcast" && isMine;
                      return (
                        <div key={u.id} className="flex gap-3 relative">
                          <div className="relative z-10">
                            <Avatar
                              name={author?.name || "Admin"}
                              initials={author?.avatar || "AD"}
                              size="md"
                              className="ring-4 ring-card"
                            />
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-foreground">
                                {author?.name || "Admin"}
                              </span>
                              <Badge
                                variant={u.type === "broadcast" ? "default" : "outline"}
                                className="text-[10px] font-semibold"
                              >
                                {u.type === "broadcast" ? (
                                  <>
                                    <Megaphone className="h-2.5 w-2.5 mr-1" /> Broadcast
                                  </>
                                ) : (
                                  <>
                                    <MapPin className="h-2.5 w-2.5 mr-1" /> {t.notifications.fieldUpdate}
                                  </>
                                )}
                              </Badge>
                              <span className="text-xs text-muted-foreground">· {u.time}</span>
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!confirm("Delete this broadcast for everyone?")) return;
                                    const { error } = await deleteFieldUpdate(u.id);
                                    if (error) toast.error("Couldn't delete", { description: error.message });
                                    else toast.success("Broadcast deleted");
                                  }}
                                  className="ml-auto text-[11px] text-destructive hover:underline"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                            <div
                              onClick={() => isLong && toggleFeed(u.id)}
                              className={`mt-1.5 p-3 rounded-lg text-sm leading-snug transition-colors ${u.type === "broadcast" ? "bg-secondary/5 border border-secondary/20 text-foreground/90" : "bg-muted/50 border border-border/60 text-foreground/85"} ${isLong ? "cursor-pointer hover:border-primary/40" : ""}`}
                            >
                              <div className={isLong && !isOpen ? "line-clamp-3" : ""}>{u.message}</div>
                              {isLong && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFeed(u.id);
                                  }}
                                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                                >
                                  {isOpen ? "Show less" : "Show more"}
                                  <ChevronDown
                                    className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                  />
                                </button>
                              )}
                              {u.attachments && u.attachments.length > 0 && (
                                <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {u.attachments.map((a) => (
                                    <a
                                      key={a.id}
                                      href={a.dataUrl}
                                      download={a.name}
                                      className="flex items-center gap-2 p-2 rounded-md border border-border/60 bg-card hover:bg-accent/50 transition-colors group"
                                    >
                                      {a.mime.startsWith("image/") ? (
                                        <img
                                          src={a.dataUrl}
                                          alt={a.name}
                                          className="h-10 w-10 rounded object-cover shrink-0"
                                        />
                                      ) : (
                                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                                          {a.mime.startsWith("image/") ? (
                                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                          ) : (
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                          )}
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="truncate text-xs font-medium">{a.name}</div>
                                        <div className="text-[10px] text-muted-foreground">
                                          {(a.size / 1024).toFixed(1)} KB
                                        </div>
                                      </div>
                                      <Download className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                            {u.type === "broadcast" && (
                              <BroadcastInteractions fieldUpdateId={u.id} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
