import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

type Search = { redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Bicycle Roma" },
      { name: "description", content: "Sign in to the Bicycle Roma operations hub." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { isAuthenticated, loading, rolesLoaded, isRentalStaff, isAdmin } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" }) as Search;
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated && rolesLoaded) {
      const requested = search.redirect ?? "/";
      const destination = isRentalStaff && !isAdmin && requested === "/" ? "/shifts" : requested;
      void navigate({ to: destination });
    }
  }, [loading, isAuthenticated, rolesLoaded, isRentalStaff, isAdmin, navigate, search.redirect]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created — check your email to confirm");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async () => {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <img src={logo} alt="Bicycle Roma" className="h-14 w-14 rounded-xl bg-white object-contain mb-3 ring-1 ring-border" />
          <h1 className="text-2xl font-bold">Bicycle Roma</h1>
          <p className="text-sm text-muted-foreground">{mode === "signin" ? "Sign in to continue" : "Create your account"}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Marco Rossi" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {mode === "signin" && (
                <button type="button" onClick={handleForgot} className="text-xs text-primary hover:underline">
                  Forgot?
                </button>
              )}
            </div>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button onClick={() => setMode("signup")} className="text-primary hover:underline">
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => setMode("signin")} className="text-primary hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>
        <p className="text-center text-xs text-muted-foreground mt-4">
          <Link to="/" className="hover:underline">← Back to app</Link>
        </p>
      </Card>
    </div>
  );
}
