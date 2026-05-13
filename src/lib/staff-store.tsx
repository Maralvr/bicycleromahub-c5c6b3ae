import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Staff } from "./mock-data";
import { supabase } from "@/integrations/supabase/client";

type ProfilePatch = Partial<Pick<Staff, "tags" | "languages" | "licenses" | "phone">>;

type StaffStoreContextValue = {
  staff: Staff[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setUnavailability: (staffId: string, unavailability: Staff["unavailability"]) => Promise<void>;
  toggleAllDay: (staffId: string, date: string, reason?: string) => Promise<void>;
  setTimeWindow: (staffId: string, date: string, from: string, to: string, reason?: string) => Promise<void>;
  clearDate: (staffId: string, date: string) => Promise<void>;
  clearMonth: (staffId: string, yearMonth: string) => Promise<void>;
  updateProfile: (staffId: string, patch: ProfilePatch) => Promise<void>;
  addStaff: (input: NewStaffInput) => Promise<Staff | null>;
  deleteStaff: (staffId: string) => Promise<void>;
};

export type NewStaffInput = {
  name: string;
  email?: string;
  phone?: string;
  role: Staff["role"];
  tags?: string[];
  languages?: string[];
  licenses?: string[];
};

const StaffStoreContext = createContext<StaffStoreContextValue | null>(null);

type StaffRow = {
  id: string;
  profile_id: string | null;
  name: string;
  avatar: string;
  role: Staff["role"];
  status: Staff["status"];
  phone: string | null;
  tags: string[] | null;
  languages: string[] | null;
  licenses: string[] | null;
};

type UnavailRow = {
  id: string;
  staff_id: string;
  date: string;
  all_day: boolean;
  from_time: string | null;
  to_time: string | null;
  reason: string | null;
};

export function StaffStoreProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [unavail, setUnavail] = useState<UnavailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [staffRes, unavailRes] = await Promise.all([
      supabase
        .from("staff")
        .select("id, profile_id, name, avatar, role, status, phone, tags, languages, licenses")
        .order("name", { ascending: true }),
      supabase
        .from("staff_unavailability")
        .select("id, staff_id, date, all_day, from_time, to_time, reason"),
    ]);
    if (staffRes.error) setError(staffRes.error.message);
    else if (unavailRes.error) setError(unavailRes.error.message);
    else {
      setRows((staffRes.data ?? []) as StaffRow[]);
      setUnavail((unavailRes.data ?? []) as UnavailRow[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
    const channel = supabase
      .channel("staff-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff" }, () => {
        void fetchAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_unavailability" }, () => {
        void fetchAll();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const staff = useMemo<Staff[]>(() => {
    const byStaff = new Map<string, Staff["unavailability"]>();
    for (const u of unavail) {
      const list = byStaff.get(u.staff_id) ?? [];
      list.push({
        date: u.date,
        allDay: u.all_day,
        from: u.from_time?.slice(0, 5) ?? undefined,
        to: u.to_time?.slice(0, 5) ?? undefined,
        reason: u.reason ?? undefined,
      });
      byStaff.set(u.staff_id, list);
    }
    return rows.map((r) => ({
      id: r.id,
      profileId: r.profile_id,
      isLive: true,
      name: r.name,
      avatar: r.avatar,
      role: r.role,
      tags: r.tags ?? [],
      languages: r.languages ?? [],
      licenses: r.licenses ?? [],
      status: r.status,
      phone: r.phone ?? "",
      unavailability: byStaff.get(r.id) ?? [],
    }));
  }, [rows, unavail]);

  const setUnavailability: StaffStoreContextValue["setUnavailability"] = async (id, list) => {
    // Replace all rows for this staff
    await supabase.from("staff_unavailability").delete().eq("staff_id", id);
    if (list.length > 0) {
      await supabase.from("staff_unavailability").insert(
        list.map((u) => ({
          staff_id: id,
          date: u.date,
          all_day: u.allDay,
          from_time: u.from ? `${u.from}:00` : null,
          to_time: u.to ? `${u.to}:00` : null,
          reason: u.reason ?? null,
        })),
      );
    }
    await fetchAll();
  };

  const getList = (id: string): Staff["unavailability"] =>
    staff.find((s) => s.id === id)?.unavailability ?? [];

  const toggleAllDay: StaffStoreContextValue["toggleAllDay"] = async (id, date, reason) => {
    const list = getList(id);
    const existing = list.find((u) => u.date === date);
    let next: Staff["unavailability"];
    if (existing && existing.allDay) {
      next = list.filter((u) => u.date !== date);
    } else {
      next = [...list.filter((u) => u.date !== date), { date, allDay: true, reason }];
    }
    await setUnavailability(id, next);
  };

  const setTimeWindow: StaffStoreContextValue["setTimeWindow"] = async (id, date, from, to, reason) => {
    const list = getList(id);
    const next = [...list.filter((u) => u.date !== date), { date, allDay: false, from, to, reason }];
    await setUnavailability(id, next);
  };

  const clearDate: StaffStoreContextValue["clearDate"] = async (id, date) => {
    await supabase.from("staff_unavailability").delete().eq("staff_id", id).eq("date", date);
    await fetchAll();
  };

  const clearMonth: StaffStoreContextValue["clearMonth"] = async (id, yearMonth) => {
    await supabase
      .from("staff_unavailability")
      .delete()
      .eq("staff_id", id)
      .gte("date", `${yearMonth}-01`)
      .lte("date", `${yearMonth}-31`);
    await fetchAll();
  };

  const updateProfile: StaffStoreContextValue["updateProfile"] = async (id, patch) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.tags !== undefined) dbPatch.tags = patch.tags;
    if (patch.languages !== undefined) dbPatch.languages = patch.languages;
    if (patch.licenses !== undefined) dbPatch.licenses = patch.licenses;
    if (patch.phone !== undefined) dbPatch.phone = patch.phone;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from("staff").update(dbPatch as any).eq("id", id);
    await fetchAll();
  };

  const addStaff: StaffStoreContextValue["addStaff"] = async (input) => {
    const initials = (input.name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2) || "?").toUpperCase();
    const payload = {
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      role: input.role,
      avatar: initials,
      tags: input.tags ?? [],
      languages: input.languages ?? [],
      licenses: input.licenses ?? [],
    };
    const { data, error: err } = await supabase
      .from("staff")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(payload as any)
      .select()
      .single();
    if (err) {
      setError(err.message);
      return null;
    }
    await fetchAll();
    const r = data as StaffRow;
    return {
      id: r.id,
      profileId: r.profile_id,
      isLive: true,
      name: r.name,
      avatar: r.avatar,
      role: r.role,
      tags: r.tags ?? [],
      languages: r.languages ?? [],
      licenses: r.licenses ?? [],
      status: r.status,
      phone: r.phone ?? "",
      unavailability: [],
    };
  };

  const deleteStaff: StaffStoreContextValue["deleteStaff"] = async (id) => {
    const { error: err } = await supabase.from("staff").delete().eq("id", id);
    if (err) setError(err.message);
    await fetchAll();
  };

  return (
    <StaffStoreContext.Provider
      value={{ staff, loading, error, refresh: fetchAll, setUnavailability, toggleAllDay, setTimeWindow, clearDate, clearMonth, updateProfile, addStaff, deleteStaff }}
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
