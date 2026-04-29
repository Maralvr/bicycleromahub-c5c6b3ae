import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { staff, FieldUpdate } from "@/lib/mock-data";
import { useNotesStore } from "@/lib/notes-store";
import { Send, Megaphone, MapPin, Sparkles } from "lucide-react";
import { useState } from "react";
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
  const { feed, notifyGuides } = useNotesStore();
  const [extra, setExtra] = useState<FieldUpdate[]>([]);
  const updates = [...extra, ...feed];
  const [msg, setMsg] = useState("");

  const send = () => {
    if (!msg.trim()) return;
    const newUpdate: FieldUpdate = {
      id: `u-${Date.now()}`,
      authorId: "admin",
      message: msg,
      type: "broadcast",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setExtra([newUpdate, ...extra]);
    const guideIds = staff.filter((s) => s.role === "guide").map((s) => s.id);
    notifyGuides(guideIds, {
      type: "broadcast",
      title: "Broadcast from admins",
      body: msg,
      link: "/notifications",
    });
    setMsg("");
    toast.success(`Push notification sent to ${guideIds.length} guides`);
  };

  return (
    <AppShell>
      <PageHeader title={t.notifications.title} subtitle={t.notifications.subtitle} />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-1 h-fit border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card relative overflow-hidden lg:sticky lg:top-6">
          <div className="absolute -top-4 -right-4 h-24 w-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-2.5 mb-3 relative">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground flex items-center justify-center shadow-[var(--shadow-elegant)]">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold leading-tight">{t.notifications.broadcast}</h2>
              <div className="text-xs text-muted-foreground">Reaches {staff.length} team members</div>
            </div>
          </div>
          <Textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder={t.notifications.placeholder}
            rows={5}
            className="mb-3 resize-none bg-card relative"
          />
          <Button onClick={send} className="w-full shadow-[var(--shadow-elegant)] relative" disabled={!msg.trim()}>
            <Send className="h-4 w-4 mr-2" /> {t.notifications.sendMessage}
          </Button>
          <div className="text-[11px] text-muted-foreground mt-3 flex items-center gap-1 relative">
            <Sparkles className="h-3 w-3 text-primary" />
            AI can rewrite for clarity before sending
          </div>
        </Card>

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
