import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "staff" | "rental_staff";

type Profile = {
  id: string;
  display_name: string;
  avatar_initials: string;
  avatar_url: string | null;
  phone: string | null;
  staff_id: string | null;
};

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  rolesLoaded: boolean;
  isAdmin: boolean;
  isRentalStaff: boolean;
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
  const [rolesLoaded, setRolesLoaded] = useState(false);

  const loadUserData = async (userId: string) => {
    try {
      setRolesLoaded(false);
      const profileRequest = supabase
        .from("profiles")
        .select("id, display_name, avatar_initials, avatar_url, phone, staff_id")
        .eq("id", userId)
        .maybeSingle();
      const rolesRequest = supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      const [profileRes, rolesRes] = await Promise.all([profileRequest, rolesRequest]);
      if (profileRes.error) throw profileRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const profileRow = profileRes.data;
      setProfile((profileRow as Profile) ?? null);
      const roleRows = rolesRes.data;
      setRoles(((roleRows ?? []) as { role: AppRole }[]).map((r) => r.role));
      setRolesLoaded(true);
    } catch (error) {
      console.error("[auth] failed to load profile/roles", error);
      setProfile(null);
      setRoles([]);
      setRolesLoaded(false);
    } finally {
      // Roles are now known — safe to release the AuthGate. Releasing earlier
      // causes an admin to briefly see the guide view on refresh because
      // `isAdmin` defaults to false until roles arrive.
      setLoading(false);
    }
  };

  useEffect(() => {
    // Set up listener BEFORE getting initial session
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
          setLoading(true);
        }
        // Defer Supabase calls to avoid deadlock with the auth state listener.
        // loadUserData() will flip `loading` to false once roles are resolved.
        setTimeout(() => {
          void loadUserData(newSession.user.id);
        }, 0);
      } else {
        setProfile(null);
        setRoles([]);
        setRolesLoaded(false);
        setLoading(false);
      }
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        await loadUserData(data.session.user.id);
      } else {
        setRolesLoaded(false);
        setLoading(false);
      }
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
    rolesLoaded,
    isAdmin: roles.includes("admin"),
    isRentalStaff: roles.includes("rental_staff") && !roles.includes("admin"),
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
