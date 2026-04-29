import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/current-user";
import { staff, FieldUpdate, Attachment } from "@/lib/mock-data";
import { useNotesStore } from "@/lib/notes-store";
import { processFiles, DEFAULT_MAX_FILES, DEFAULT_MAX_SIZE } from "@/components/attachment-picker";
import { Send, Megaphone, MapPin, Sparkles, Bell, CheckCheck, CalendarRange, AlertTriangle, X, ListChecks, Paperclip, FileText, Image as ImageIcon, Download, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — eBicycle Roma" },
      { name: "description", content: "Broadcast messages and live field updates from guides." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { t } = useI18n();
  const { role, staffId } = useCurrentUser();
  const isAdmin = role === "admin";
  const { feed, notifyGuides, notifications, markAllRead, markRead } = useNotesStore();
  const myNotifs = notifications.filter((n) => n.staffId === staffId);
  const unread = myNotifs.filter((n) => !n.read).length;
  const [extra, setExtra] = useState<FieldUpdate[]>([]);
  const updates = [...extra, ...feed];
  const [msg, setMsg] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const send = () => {
    if (!msg.trim() && attachments.length === 0) return;
    const newUpdate: FieldUpdate = {
      id: `u-${Date.now()}`,
      authorId: "admin",
      message: msg || (attachments.length === 1 ? `Shared ${attachments[0].name}` : `Shared ${attachments.length} files`),
      type: "broadcast",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      attachments: attachments.length ? attachments : undefined,
    };
    setExtra([newUpdate, ...extra]);
    const guideIds = staff.filter((s) => s.role === "guide").map((s) => s.id);
    notifyGuides(guideIds, {
      type: "broadcast",
      title: "Broadcast from admins",
      body: newUpdate.message,
      link: "/notifications",
      attachments: attachments.length ? attachments : undefined,
    });
    setMsg("");
    setAttachments([]);
    toast.success(`Push notification sent to ${guideIds.length} guides`);
  };

  return (
    <AppShell>
      <PageHeader title={t.notifications.title} subtitle={t.notifications.subtitle} />

      <div className="grid lg:grid-cols-3 gap-6">
        {isAdmin ? (
          <Card className="p-5 lg:col-span-1 h-fit border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card relative overflow-hidden lg:sticky lg:top-6">
            <div className="absolute -top-4 -right-4 h-24 w-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center gap-2.5 mb-3 relative">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground flex items-center justify-center shadow-[var(--shadow-elegant)]">
                <Megaphone className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold leading-tight">{t.notifications.broadcast}</h2>
                <div className="text-xs text-muted-foreground">Reaches {staff.filter((s) => s.role === "guide").length} guides</div>
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
                  <div key={a.id} className="flex items-center gap-2 p-2 rounded-md border border-border/60 bg-card text-xs">
                    {a.mime.startsWith("image/") ? (
                      <img src={a.dataUrl} alt={a.name} className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{a.name}</div>
                      <div className="text-[10px] text-muted-foreground">{(a.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeAttachment(a.id)}>
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
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button onClick={send} className="flex-1 shadow-[var(--shadow-elegant)]" disabled={!msg.trim() && attachments.length === 0}>
                <Send className="h-4 w-4 mr-2" /> {t.notifications.sendMessage}
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground mt-3 flex items-center gap-1 relative">
              <Sparkles className="h-3 w-3 text-primary" />
              AI can rewrite for clarity before sending · Attach images, PDFs or any file (max 10MB)
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
                  <div className="text-xs text-muted-foreground">{unread > 0 ? `${unread} unread` : "All caught up"}</div>
                </div>
              </div>
              {unread > 0 && staffId && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markAllRead(staffId)}>
                  <CheckCheck className="h-3.5 w-3.5 mr-1" /> Read all
                </Button>
              )}
            </div>
            {myNotifs.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-6 text-center">
                You'll see schedule changes, broadcasts and updates here.
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {myNotifs.slice(0, 20).map((n) => {
                  const Icon = n.type === "broadcast" ? Megaphone : n.type === "shift_cancelled" ? AlertTriangle : n.type === "unassigned" ? X : n.type === "task" ? ListChecks : CalendarRange;
                  return (
                    <button
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${n.read ? "bg-card border-border/60" : "bg-primary/5 border-primary/30"}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="h-3 w-3 text-primary" />
                        <span className="font-semibold text-foreground">{n.title}</span>
                        {!n.read && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
                      </div>
                      <div className="text-muted-foreground line-clamp-2">{n.body}</div>
                      {n.attachments && n.attachments.length > 0 && (
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-primary">
                          <Paperclip className="h-2.5 w-2.5" />
                          {n.attachments.length} attachment{n.attachments.length > 1 ? "s" : ""}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold">Activity feed</h2>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> Live
            </span>
          </div>
          <div className="relative">
            <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-5">
              {updates.map((u) => {
                const author = staff.find((s) => s.id === u.authorId);
                return (
                  <div key={u.id} className="flex gap-3 relative">
                    <div className="relative z-10">
                      <Avatar name={author?.name || "Admin"} initials={author?.avatar || "AD"} size="md" className="ring-4 ring-card" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{author?.name || "Admin"}</span>
                        <Badge variant={u.type === "broadcast" ? "default" : "outline"} className="text-[10px] font-semibold">
                          {u.type === "broadcast" ? (
                            <><Megaphone className="h-2.5 w-2.5 mr-1" /> Broadcast</>
                          ) : (
                            <><MapPin className="h-2.5 w-2.5 mr-1" /> {t.notifications.fieldUpdate}</>
                          )}
                        </Badge>
                        <span className="text-xs text-muted-foreground">· {u.time}</span>
                      </div>
                      <div className={`mt-1.5 p-3 rounded-lg text-sm leading-snug ${u.type === "broadcast" ? "bg-secondary/5 border border-secondary/20 text-foreground/90" : "bg-muted/50 border border-border/60 text-foreground/85"}`}>
                        {u.message}
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
                                  <img src={a.dataUrl} alt={a.name} className="h-10 w-10 rounded object-cover shrink-0" />
                                ) : (
                                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                                    {a.mime.startsWith("image/") ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="truncate text-xs font-medium">{a.name}</div>
                                  <div className="text-[10px] text-muted-foreground">{(a.size / 1024).toFixed(1)} KB</div>
                                </div>
                                <Download className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
