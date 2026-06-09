import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { usePushSubscription } from "@/hooks/use-push-subscription";

export function PushToggle() {
  const { status, supported, subscribe, disable, test, error } = usePushSubscription();

  if (!supported) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <BellOff className="h-3.5 w-3.5" />
        Push notifications not supported in this browser
      </div>
    );
  }

  const handleEnable = async () => {
    await subscribe();
    toast.success("Push notifications enabled", {
      description: "You'll be alerted on this device when shifts are assigned.",
    });
  };

  const handleDisable = async () => {
    await disable();
    toast.info("Push notifications disabled on this device");
  };

  const handleTest = async () => {
    try {
      const r = await test();
      if (r.sent > 0) {
        toast.success(`Test push sent to ${r.sent} device${r.sent === 1 ? "" : "s"}`);
      } else {
        toast.warning("No active devices found", {
          description: "Try enabling push first, or check the browser permission.",
        });
      }
    } catch (e) {
      toast.error("Test push failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "subscribed" && (
        <Badge variant="outline" className="border-success/40 text-success">
          <BellRing className="h-3 w-3 mr-1" /> Push on
        </Badge>
      )}
      {status === "blocked" && (
        <div className="text-xs text-destructive flex items-center gap-1.5">
          <BellOff className="h-3.5 w-3.5" />
          Blocked by browser — enable notifications in site settings.
        </div>
      )}
      {status === "loading" && (
        <Button variant="outline" size="sm" disabled>
          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Working…
        </Button>
      )}
      {status === "idle" && (
        <Button variant="outline" size="sm" onClick={handleEnable}>
          <Bell className="h-3.5 w-3.5 mr-1" /> Enable push notifications
        </Button>
      )}
      {status === "subscribed" && (
        <>
          <Button variant="outline" size="sm" onClick={handleTest}>
            Send test push
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDisable}>
            <BellOff className="h-3.5 w-3.5 mr-1" /> Disable
          </Button>
        </>
      )}
      {error && (
        <span className="text-[11px] text-destructive truncate max-w-xs" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
