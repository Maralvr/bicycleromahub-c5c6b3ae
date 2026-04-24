import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { Staff, staff as initialStaff } from "./mock-data";

type StaffStoreContextValue = {
  staff: Staff[];
  setUnavailability: (staffId: string, unavailability: Staff["unavailability"]) => void;
  toggleAllDay: (staffId: string, date: string, reason?: string) => void;
  setTimeWindow: (staffId: string, date: string, from: string, to: string, reason?: string) => void;
  clearDate: (staffId: string, date: string) => void;
  clearMonth: (staffId: string, yearMonth: string) => void;
};

const StaffStoreContext = createContext<StaffStoreContextValue | null>(null);

const STORAGE_KEY = "ebr.staffUnavailability";

/**
 * Lightweight client-side store that overlays user-edited unavailability
 * on top of the seeded mock staff data. Persisted to localStorage so the
 * staff view, admin view, and matcher all stay in sync.
 */
export function StaffStoreProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, Staff["unavailability"]>>({});

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setOverrides(JSON.parse(raw));
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

  const staff = useMemo<Staff[]>(
    () =>
      initialStaff.map((s) =>
        overrides[s.id] !== undefined ? { ...s, unavailability: overrides[s.id] } : s,
      ),
    [overrides],
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
      // Already all-day → clear it
      next = list.filter((u) => u.date !== date);
    } else {
      // Replace any partial entry with an all-day entry
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

  return (
    <StaffStoreContext.Provider
      value={{ staff, setUnavailability, toggleAllDay, setTimeWindow, clearDate, clearMonth }}
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
