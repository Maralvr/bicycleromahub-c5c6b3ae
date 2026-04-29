import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { staff } from "./mock-data";
import { useAuth } from "./auth";

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
  // Default role is derived from real auth roles. Admins may still impersonate
  // a guide via the role switcher (kept for QA). Non-admins are locked to staff.
  const [roleOverride, setRoleOverride] = useState<ViewRole | null>(null);
  const [staffId, setStaffIdState] = useState<string>("s1");

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

  // If signed-in profile has a linked staff_id, prefer it
  useEffect(() => {
    if (profile?.staff_id) setStaffIdState(profile.staff_id);
  }, [profile?.staff_id]);

  const persist = (next: { role: ViewRole | null; staffId: string }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  // Effective role: non-admins always "staff"; admins respect override or default to admin
  const role: ViewRole = isAdmin ? (roleOverride ?? "admin") : "staff";

  const setRole = (r: ViewRole) => {
    if (!isAdmin && r === "admin") return; // guard: non-admins cannot assume admin
    setRoleOverride(r);
    persist({ role: r, staffId });
  };
  const setStaffId = (id: string) => {
    setStaffIdState(id);
    persist({ role: roleOverride, staffId: id });
  };

  const member = staff.find((s) => s.id === staffId) ?? staff[0];
  const isAdminView = role === "admin";

  const value: CurrentUserContextValue = {
    role,
    staffId,
    setRole,
    setStaffId,
    displayName: isAdminView
      ? profile?.display_name || "Admin"
      : profile?.display_name || member.name,
    initials: isAdminView
      ? profile?.avatar_initials || "AD"
      : profile?.avatar_initials || member.avatar,
    subtitle: isAdminView
      ? "Operations"
      : member.role.charAt(0).toUpperCase() + member.role.slice(1),
  };

  // Touch user to silence unused warning when not needed
  void user;

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within CurrentUserProvider");
  return ctx;
}
