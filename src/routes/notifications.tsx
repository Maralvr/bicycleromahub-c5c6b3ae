import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { updates as initialUpdates, staff, FieldUpdate } from "@/lib/mock-data";
import { Send, Megaphone, MapPin } from "lucide-react";
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
  const [updates, setUpdates] = useState<FieldUpdate[]>(initialUpdates);
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
    setUpdates([newUpdate, ...updates]);
    setMsg("");
    toast.success("Push notification sent to team");
  };

  return (
    <AppShell>
      <PageHeader title={t.notifications.title} subtitle={t.notifications.subtitle} />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-1 h-fit border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <Megaphone className="h-4 w-4" />
            </div>
            <h2 className="font-semibold">{t.notifications.broadcast}</h2>
          </div>
          <Textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder={t.notifications.placeholder}
            rows={5}
            className="mb-3 resize-none"
          />
          <Button onClick={send} className="w-full" disabled={!msg.trim()}>
            <Send className="h-4 w-4 mr-2" /> {t.notifications.sendMessage}
          </Button>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold mb-4">Activity feed</h2>
          <div className="space-y-4">
            {updates.map((u) => {
              const author = staff.find((s) => s.id === u.authorId);
              return (
                <div key={u.id} className="flex gap-3 pb-4 border-b border-border last:border-0 last:pb-0">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${u.type === "broadcast" ? "bg-secondary text-secondary-foreground" : "bg-primary/15 text-foreground"}`}>
                    {author?.avatar || "AD"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground">{author?.name || "Admin"}</span>
                      <Badge variant={u.type === "broadcast" ? "default" : "outline"} className="text-[10px]">
                        {u.type === "broadcast" ? (
                          <><Megaphone className="h-2.5 w-2.5 mr-1" /> Broadcast</>
                        ) : (
                          <><MapPin className="h-2.5 w-2.5 mr-1" /> {t.notifications.fieldUpdate}</>
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">· {u.time}</span>
                    </div>
                    <p className="text-sm text-foreground/85 mt-1">{u.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
