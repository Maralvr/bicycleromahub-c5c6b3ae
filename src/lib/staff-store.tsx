import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { Staff, staff as initialStaff } from "./mock-data";

type ProfilePatch = Partial<Pick<Staff, "tags" | "languages" | "licenses" | "phone">>;

type StaffStoreContextValue = {
  staff: Staff[];
  setUnavailability: (staffId: string, unavailability: Staff["unavailability"]) => void;
  toggleAllDay: (staffId: string, date: string, reason?: string) => void;
  setTimeWindow: (staffId: string, date: string, from: string, to: string, reason?: string) => void;
  clearDate: (staffId: string, date: string) => void;
  clearMonth: (staffId: string, yearMonth: string) => void;
  updateProfile: (staffId: string, patch: ProfilePatch) => void;
};

const StaffStoreContext = createContext<StaffStoreContextValue | null>(null);

const STORAGE_KEY = "ebr.staffUnavailability";
const PROFILE_KEY = "ebr.staffProfileOverrides";

/**
 * Lightweight client-side store that overlays user-edited unavailability and
 * profile fields on top of the seeded mock staff data. Persisted to
 * localStorage so the staff view, admin view, and matcher all stay in sync.
 */
export function StaffStoreProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, Staff["unavailability"]>>({});
  const [profileOverrides, setProfileOverrides] = useState<Record<string, ProfilePatch>>({});

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setOverrides(JSON.parse(raw));
      const rawProfile = localStorage.getItem(PROFILE_KEY);
      if (rawProfile) setProfileOverrides(JSON.parse(rawProfile));
    } catch {
      // ignore
    }
  }, []);

  const persist = (next: Record<string, Staff["unavailability"]>) => {
    setOverrides(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const persistProfile = (next: Record<string, ProfilePatch>) => {
    setProfileOverrides(next);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const staff = useMemo<Staff[]>(
    () =>
      initialStaff.map((s) => {
        const merged: Staff = { ...s, ...(profileOverrides[s.id] ?? {}) };
        if (overrides[s.id] !== undefined) merged.unavailability = overrides[s.id];
        return merged;
      }),
    [overrides, profileOverrides],
  );

  const setUnavailability: StaffStoreContextValue["setUnavailability"] = (id, list) => {
    persist({ ...overrides, [id]: list });
  };

  const getList = (id: string): Staff["unavailability"] =>
    overrides[id] ?? initialStaff.find((s) => s.id === id)?.unavailability ?? [];

  const toggleAllDay: StaffStoreContextValue["toggleAllDay"] = (id, date, reason) => {
    const list = getList(id);
    const existing = list.find((u) => u.date === date);
    let next: Staff["unavailability"];
    if (existing && existing.allDay) {
      next = list.filter((u) => u.date !== date);
    } else {
      next = [...list.filter((u) => u.date !== date), { date, allDay: true, reason }];
    }
    persist({ ...overrides, [id]: next });
  };

  const setTimeWindow: StaffStoreContextValue["setTimeWindow"] = (id, date, from, to, reason) => {
    const list = getList(id);
    const next = [
      ...list.filter((u) => u.date !== date),
      { date, allDay: false, from, to, reason },
    ];
    persist({ ...overrides, [id]: next });
  };

  const clearDate: StaffStoreContextValue["clearDate"] = (id, date) => {
    const list = getList(id);
    persist({ ...overrides, [id]: list.filter((u) => u.date !== date) });
  };

  const clearMonth: StaffStoreContextValue["clearMonth"] = (id, yearMonth) => {
    const list = getList(id);
    persist({ ...overrides, [id]: list.filter((u) => !u.date.startsWith(yearMonth)) });
  };

  const updateProfile: StaffStoreContextValue["updateProfile"] = (id, patch) => {
    persistProfile({ ...profileOverrides, [id]: { ...(profileOverrides[id] ?? {}), ...patch } });
  };

  return (
    <StaffStoreContext.Provider
      value={{ staff, setUnavailability, toggleAllDay, setTimeWindow, clearDate, clearMonth, updateProfile }}
    >
      {children}
    </StaffStoreContext.Provider>
  );
}

export function useStaffStore() {
  const ctx = useContext(StaffStoreContext);
  if (!ctx) throw new Error("useStaffStore must be used within StaffStoreProvider");
  return ctx;
}
