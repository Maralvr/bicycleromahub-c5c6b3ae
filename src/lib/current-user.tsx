import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { staff } from "./mock-data";

export type ViewRole = "admin" | "staff";

type CurrentUserContextValue = {
  role: ViewRole;
  staffId: string; // the staff member identity used when role === "staff"
  setRole: (r: ViewRole) => void;
  setStaffId: (id: string) => void;
  displayName: string;
  initials: string;
  subtitle: string;
};

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

const STORAGE_KEY = "ebr.currentUser";

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<ViewRole>("admin");
  const [staffId, setStaffIdState] = useState<string>("s1");

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { role?: ViewRole; staffId?: string };
        if (parsed.role) setRoleState(parsed.role);
        if (parsed.staffId) setStaffIdState(parsed.staffId);
      }
    } catch {
      // ignore
    }
  }, []);

  const persist = (next: { role: ViewRole; staffId: string }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const setRole = (r: ViewRole) => {
    setRoleState(r);
    persist({ role: r, staffId });
  };
  const setStaffId = (id: string) => {
    setStaffIdState(id);
    persist({ role, staffId: id });
  };

  const member = staff.find((s) => s.id === staffId) ?? staff[0];
  const isAdmin = role === "admin";

  const value: CurrentUserContextValue = {
    role,
    staffId,
    setRole,
    setStaffId,
    displayName: isAdmin ? "Admin" : member.name,
    initials: isAdmin ? "AD" : member.avatar,
    subtitle: isAdmin ? "Operations" : member.role.charAt(0).toUpperCase() + member.role.slice(1),
  };

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within CurrentUserProvider");
  return ctx;
}
