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
  /**
   * True only for a *settled* unauthenticated state: either we resolved the
   * initial session and there was none, or Supabase emitted an explicit
   * SIGNED_OUT. A momentary null session during token-refresh-on-focus does
   * NOT set this — that transient blip used to bounce the user through /auth
   * and wipe the current route's query string (e.g. the calendar's ?date=).
   */
  signedOut: boolean;
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
  const [signedOut, setSignedOut] = useState(false);


  const loadUserData = async (userId: string) => {
    // NOTE: intentionally do NOT reset rolesLoaded=false here. Once roles are
    // known, keep the UI unblocked; a refresh just replaces the values in
    // place. Flipping this back to false during focus refresh caused the
    // AuthGate to fall back to the "Loading…" spinner mid-session.
    try {
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
      if (profileRes.error) console.error("[auth] profile load error", profileRes.error);
      if (rolesRes.error) console.error("[auth] roles load error", rolesRes.error);

      const profileRow = profileRes.data;
      if (profileRow) setProfile(profileRow as Profile);
      const roleRows = rolesRes.data;
      if (!rolesRes.error) {
        setRoles(((roleRows ?? []) as { role: AppRole }[]).map((r) => r.role));
      }
    } catch (error) {
      console.error("[auth] failed to load profile/roles", error);
    } finally {
      // Always unblock the UI, even if the role fetch failed. Keeping
      // rolesLoaded=false here previously trapped rental users on the sign-in
      // spinner when a transient PostgREST error hit either query.
      setRolesLoaded(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Set up listener BEFORE getting initial session
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setSignedOut(false);
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
          setLoading(true);
        }
        // Defer Supabase calls to avoid deadlock with the auth state listener.
        // loadUserData() will flip `loading` to false once roles are resolved.
        setTimeout(() => {
          void loadUserData(newSession.user.id);
        }, 0);
      } else {
        // Only an explicit SIGNED_OUT (or the resolved initial no-session below)
        // counts as a real sign-out. Any other event arriving with a null
        // session is a transient blip (token refresh on tab focus) and must not
        // trigger the /auth redirect.
        if (event === "SIGNED_OUT" || event === "INITIAL_SESSION") setSignedOut(true);
        setProfile(null);
        setRoles([]);
        setRolesLoaded(false);
        setLoading(false);
      }
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        setSignedOut(false);
        await loadUserData(data.session.user.id);
      } else {
        setSignedOut(true);
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
    signedOut: !session && signedOut,

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
