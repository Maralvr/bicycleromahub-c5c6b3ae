import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { UserCircle2, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/**
 * One-time dismissible prompt asking the user to complete their profile.
 * Appears on every page (inside AppShell) until either the profile is complete
 * (display_name + phone + avatar_url) or the user dismisses it.
 */
export function ProfileCompletionPrompt() {
  const { user, profile } = useAuth();
  const [dismissed, setDismissed] = useState(true);

  const storageKey = user ? `profile-prompt-dismissed:${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    setDismissed(localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  if (!user || !profile) return null;

  const missing: string[] = [];
  if (!profile.display_name || profile.display_name.trim().length < 2) missing.push("name");
  if (!profile.phone || profile.phone.trim().length < 4) missing.push("phone number");
  if (!profile.avatar_url) missing.push("photo");

  if (missing.length === 0 || dismissed) return null;

  const dismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, "1");
    setDismissed(true);
  };

  const list =
    missing.length === 1
      ? missing[0]
      : missing.length === 2
        ? `${missing[0]} and ${missing[1]}`
        : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;

  return (
    <div className="mb-5 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <UserCircle2 className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">
            Complete your profile
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Please add your <span className="font-medium text-foreground">{list}</span>{" "}
            so your team can recognise and reach you.
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="h-8">
              <Link to="/profile">Edit profile</Link>
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={dismiss}>
              Later
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
