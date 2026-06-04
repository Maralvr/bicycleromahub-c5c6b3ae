import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useAuth } from "./auth";
import { useStaffStore } from "./staff-store";

export type ViewRole = "admin" | "staff";

type CurrentUserContextValue = {
  role: ViewRole;
  staffId: string;
  setRole: (r: ViewRole) => void;
  setStaffId: (id: string) => void;
  displayName: string;
  initials: string;
  subtitle: string;
};

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

const STORAGE_KEY = "ebr.currentUser";

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { isAdmin, profile, user } = useAuth();
  const { staff } = useStaffStore();
  const [roleOverride, setRoleOverride] = useState<ViewRole | null>(null);
  const [staffId, setStaffIdState] = useState<string>("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { role?: ViewRole; staffId?: string };
        if (parsed.role) setRoleOverride(parsed.role);
        if (parsed.staffId) setStaffIdState(parsed.staffId);
      }
    } catch {
      // ignore
    }
  }, []);

  // Auto-bind to the staff row that matches the signed-in user (by profile_id),
  // unless the admin has manually impersonated someone.
  useEffect(() => {
    if (!user) return;
    const profileStaffId = profile?.staff_id;
    const myRow = staff.find((s) => s.profileId === user.id || (profileStaffId && s.id === profileStaffId));
    if (profileStaffId && (!isAdmin || !staffId)) {
      setStaffIdState(profileStaffId);
    } else if (myRow && (!isAdmin || !staffId)) {
      setStaffIdState(myRow.id);
    } else if (!staffId && staff[0]) {
      setStaffIdState(staff[0].id);
    }
  }, [user, profile?.staff_id, staff, staffId, isAdmin]);

  const persist = (next: { role: ViewRole | null; staffId: string }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  // Admins always default to admin view; they must explicitly opt into guide view per session.
  // (Stale "staff" override from localStorage is ignored to prevent admins getting locked in guide view.)
  const role: ViewRole = isAdmin ? "admin" : "staff";

  const setRole = (r: ViewRole) => {
    if (!isAdmin && r === "admin") return;
    setRoleOverride(r);
    persist({ role: r, staffId });
  };
  const setStaffId = (id: string) => {
    setStaffIdState(id);
    persist({ role: roleOverride, staffId: id });
  };

  const member = staff.find((s) => s.id === staffId);
  const isAdminView = role === "admin";

  const value: CurrentUserContextValue = {
    role,
    staffId,
    setRole,
    setStaffId,
    displayName: isAdminView
      ? profile?.display_name || "Admin"
      : profile?.display_name || member?.name || "Guide",
    initials: isAdminView
      ? profile?.avatar_initials || "AD"
      : profile?.avatar_initials || member?.avatar || "GD",
    subtitle: isAdminView
      ? "Operations"
      : member ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : "Guide",
  };

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within CurrentUserProvider");
  return ctx;
}
