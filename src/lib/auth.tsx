import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "staff";

type Profile = {
  id: string;
  display_name: string;
  avatar_initials: string;
  phone: string | null;
  staff_id: string | null;
};

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  isAdmin: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);

  const loadUserData = async (userId: string) => {
    const [{ data: profileRow }, { data: roleRows, error: roleErr }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, avatar_initials, phone, staff_id")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    console.log("[auth] loadUserData", { userId, roleRows, roleErr });
    setProfile((profileRow as Profile) ?? null);
    setRoles(((roleRows ?? []) as { role: AppRole }[]).map((r) => r.role));
  };

  useEffect(() => {
    // Safety net: never let the app hang on the loading screen.
    // If session retrieval stalls (flaky network on installed PWA,
    // Supabase slow to respond), force-resolve loading after 6s so the
    // user can at least reach the auth screen.
    const safetyTimer = setTimeout(() => {
      setLoading((prev) => {
        if (prev) console.warn("[auth] safety timeout — forcing loading=false");
        return false;
      });
    }, 6000);

    // Set up listener BEFORE getting initial session
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        // Defer Supabase calls to avoid deadlock with the auth state listener
        setTimeout(() => {
          void loadUserData(newSession.user.id);
        }, 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
      // The listener fires immediately with INITIAL_SESSION — use that
      // to release the loading gate even if getSession() is slow.
      setLoading(false);
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        await loadUserData(data.session.user.id);
      }
      setLoading(false);
    });

    // Refresh roles/profile when the tab regains focus so DB-side role changes
    // (e.g. an admin promoted the user) take effect without a hard reload.
    const onFocus = () => {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user) void loadUserData(data.session.user.id);
      });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    // Live-subscribe to role changes for the current user so promotions/demotions
    // are reflected in the UI immediately.
    let rolesChannel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (!uid) return;
      rolesChannel = supabase
        .channel(`user_roles:${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${uid}` },
          () => {
            void loadUserData(uid);
          },
        )
        .subscribe();
    });

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      if (rolesChannel) void supabase.removeChannel(rolesChannel);
    };

  }, []);

  const value: AuthContextValue = {
    loading,
    session,
    user: session?.user ?? null,
    profile,
    roles,
    isAdmin: roles.includes("admin"),
    isAuthenticated: !!session,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refresh: async () => {
      if (session?.user) await loadUserData(session.user.id);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
