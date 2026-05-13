import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updatePasswordFromRecoverySession } from "@/lib/password-reset.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

const RECOVERY_TIMEOUT_MS = 8000;
const EXPIRED_MESSAGE = "Recovery link is missing or expired. Request a new password reset email.";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Reset password — Bicycle Roma" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const updatePassword = useServerFn(updatePasswordFromRecoverySession);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState("");
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let settled = false;

    const finish = (token = "", message = "") => {
      if (settled) return;
      settled = true;
      setRecoveryToken(token);
      setAuthError(message);
      setReady(true);
    };

    const timeout = window.setTimeout(() => {
      finish("", EXPIRED_MESSAGE);
    }, RECOVERY_TIMEOUT_MS);

    const parseRecoverySession = async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const search = new URLSearchParams(window.location.search);
      const accessToken = hash.get("access_token") ?? search.get("access_token");
      const refreshToken = hash.get("refresh_token") ?? search.get("refresh_token");
      const code = search.get("code") ?? hash.get("code");

      try {
        if (accessToken) {
          window.history.replaceState(null, document.title, window.location.pathname);
          finish(accessToken);
          return;
        }

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          window.history.replaceState(null, document.title, window.location.pathname);
          finish(data.session?.access_token ?? "");
          return;
        }

        finish("", EXPIRED_MESSAGE);
      } catch (err) {
        finish("", err instanceof Error ? err.message : "Recovery link expired or invalid.");
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s?.access_token) finish(s.access_token);
    });

    void parseRecoverySession();

    return () => {
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!recoveryToken) {
      toast.error("Recovery link expired or invalid. Request a new reset email.");
      return;
    }
    setBusy(true);
    try {
      await updatePassword({
        data: { accessToken: recoveryToken, password },
      });
      await supabase.auth.signOut();
      toast.success("Password updated");
      void navigate({ to: "/auth", search: { redirect: "/" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold mb-2">Set a new password</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Enter the new password for your account.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy || !ready || !recoveryToken}>
            {!ready ? "Loading…" : busy ? "Updating…" : "Update password"}
          </Button>
          {ready && !recoveryToken && (
            <p className="text-sm text-destructive">{authError || EXPIRED_MESSAGE}</p>
          )}
        </form>
      </Card>
    </div>
  );
}
