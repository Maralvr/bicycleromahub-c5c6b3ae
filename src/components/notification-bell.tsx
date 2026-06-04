import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, CheckCheck, CalendarRange, Megaphone, AlertTriangle, ListChecks, X, CheckCircle2, XCircle, Paperclip } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotesStore, GuideNotification } from "@/lib/notes-store";
import { cn } from "@/lib/utils";

const TYPE_META: Record<GuideNotification["type"], { icon: typeof Bell; cls: string; label: string }> = {
  assigned: { icon: CalendarRange, cls: "bg-primary/10 text-primary border-primary/30", label: "New shift" },
  reassigned: { icon: CalendarRange, cls: "bg-secondary/10 text-secondary-foreground border-secondary/30", label: "Reassigned" },
  unassigned: { icon: X, cls: "bg-muted text-muted-foreground border-border", label: "Removed" },
  shift_updated: { icon: CalendarRange, cls: "bg-warning/10 text-warning-foreground border-warning/30", label: "Shift updated" },
  shift_cancelled: { icon: AlertTriangle, cls: "bg-destructive/10 text-destructive border-destructive/30", label: "Cancelled" },
  shift_accepted: { icon: CheckCircle2, cls: "bg-success/10 text-success border-success/30", label: "Accepted" },
  shift_rejected: { icon: XCircle, cls: "bg-destructive/10 text-destructive border-destructive/30", label: "Rejected" },
  broadcast: { icon: Megaphone, cls: "bg-secondary/10 text-secondary-foreground border-secondary/30", label: "Broadcast" },
  reminder: { icon: Bell, cls: "bg-primary/10 text-primary border-primary/30", label: "Reminder" },
  task: { icon: ListChecks, cls: "bg-accent text-foreground border-border", label: "Task" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function NotificationBell({ staffId }: { staffId: string }) {
  const { notifications, unreadCountFor, markRead, markAllRead } = useNotesStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = unreadCountFor(staffId);
  const mine = notifications.filter((n) => n.staffId === staffId).slice(0, 30);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative h-9 w-9 rounded-lg flex items-center justify-center bg-muted hover:bg-accent transition-colors"
          aria-label={`${unread} unread notifications`}
        >
          <Bell className="h-4 w-4 text-foreground" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center ring-2 ring-card animate-pulse">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div>
            <div className="font-semibold text-sm">Notifications</div>
            <div className="text-[11px] text-muted-foreground">{unread > 0 ? `${unread} unread` : "All caught up"}</div>
          </div>
          {unread > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markAllRead(staffId)}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[420px]">
          {mine.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {mine.map((n) => {
                const meta = TYPE_META[n.type];
                const Icon = meta.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={cn(
                      "w-full text-left p-3 hover:bg-muted/50 transition-colors flex gap-2.5",
                      !n.read && "bg-primary/5"
                    )}
                  >
                    <div className={cn("h-7 w-7 rounded-md border flex items-center justify-center flex-shrink-0", meta.cls)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider h-4 px-1.5">{meta.label}</Badge>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                        {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      </div>
                      <div className="text-xs font-semibold text-foreground mt-1">{n.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</div>
                      {n.attachments && n.attachments.length > 0 && (
                        <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                          <Paperclip className="h-2.5 w-2.5" />
                          {n.attachments.length} attachment{n.attachments.length > 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
        <div className="p-2 border-t border-border">
          <Link to="/notifications" className="block text-center text-xs text-primary font-semibold hover:underline py-1.5">
            View all in activity feed →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
