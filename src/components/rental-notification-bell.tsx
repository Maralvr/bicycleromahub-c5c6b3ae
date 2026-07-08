import { useEffect, useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck, CalendarRange, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  listMyRentalNotifications,
  markRentalNotificationRead,
} from "@/lib/rental-staff.functions";

type RentalNotif = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
};

function timeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function RentalNotificationBell() {
  const list = useServerFn(listMyRentalNotifications);
  const mark = useServerFn(markRentalNotificationRead);
  const { user } = useAuth();
  const [items, setItems] = useState<RentalNotif[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      const r = await list();
      setItems(r.notifications as RentalNotif[]);
    } catch {
      /* silent */
    }
  }, [list]);

  // Unique per mounted instance: this component renders twice at once
  // (desktop sidebar + mobile header), and Supabase's realtime client
  // reuses/returns the same channel object for a duplicate topic name.
  // Calling `.on()` on that already-subscribed channel throws
  // "cannot add postgres_changes callbacks ... after subscribe()".
  // A random suffix keeps each instance's channel independent (same
  // pattern already used in rental-points.ts / waivers-store.ts).
  const instanceIdRef = useRef(Math.random().toString(36).slice(2));

  useEffect(() => {
    void refresh();
    if (!user) return;
    const ch = supabase
      .channel(`rental_notif:${user.id}:${instanceIdRef.current}`)
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative h-9 w-9 rounded-lg flex items-center justify-center bg-muted hover:bg-accent transition-colors"
          aria-label={`${unread} unread notifications`}
        >
          <Bell className="h-4 w-4 text-foreground" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center ring-2 ring-card">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="font-semibold text-sm">Rental-day notifications</div>
          {unread > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await mark({ data: { all: true } });
                await refresh();
              }}
            >
              <CheckCheck className="h-3 w-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[400px]">
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No notifications yet.</div>
          ) : (
            <div className="divide-y divide-border/40">
              {items.map((n) => {
                const Icon = n.type === "unassigned" ? X : n.type === "reminder" ? Bell : CalendarRange;
                return (
                  <button
                    key={n.id}
                    onClick={async () => {
                      if (!n.read) {
                        await mark({ data: { id: n.id } });
                        await refresh();
                      }
                      if (n.link) {
                        // Preserve the query string (e.g. ?rental_day=<id>)
                        // instead of discarding it -- see notifications.tsx
                        // for the same fix and rationale.
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
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full text-left p-3 hover:bg-accent/50 transition-colors",
                      !n.read && "bg-primary/5",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground">{n.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</div>
                      </div>
                      {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
