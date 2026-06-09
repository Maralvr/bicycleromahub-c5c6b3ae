import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
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
  const ownStaffId = useMemo(
    () =>
      profile?.staff_id ||
      (user ? (staff.find((s) => s.profileId === user.id)?.id ?? "") : ""),
    [profile?.staff_id, staff, user],
  );
  const effectiveStaffId = isAdmin
    ? staffId || ownStaffId || staff[0]?.id || ""
    : ownStaffId;

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

  // Guides must always bind to their own staff row. Stored/admin-selected staff
  // ids can be stale after sign-in and would make notification queries miss.
  useEffect(() => {
    if (!user) return;
    if (!isAdmin && ownStaffId && staffId !== ownStaffId) {
      setStaffIdState(ownStaffId);
    } else if (isAdmin && !staffId && ownStaffId) {
      setStaffIdState(ownStaffId);
    } else if (isAdmin && !staffId && staff[0]) {
      setStaffIdState(staff[0].id);
    }
  }, [user, ownStaffId, staff, staffId, isAdmin]);

  const persist = (next: { role: ViewRole | null; staffId: string }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  // Admins may opt into the guide view via the toggle; the choice persists in localStorage.
  // Non-admins are always locked to staff view.
  const role: ViewRole = isAdmin ? (roleOverride === "staff" ? "staff" : "admin") : "staff";

  const setRole = (r: ViewRole) => {
    if (!isAdmin && r === "admin") return;
    setRoleOverride(r);
    persist({ role: r, staffId });
  };
  const setStaffId = (id: string) => {
    setStaffIdState(id);
    persist({ role: roleOverride, staffId: id });
  };

  const member = staff.find((s) => s.id === effectiveStaffId);
  const isAdminView = role === "admin";

  const value: CurrentUserContextValue = {
    role,
    staffId: effectiveStaffId,
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
