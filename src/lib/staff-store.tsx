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
  email: string | null;
  active: boolean;
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
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [staffRes, unavailRes, profilesRes] = await Promise.all([
      supabase
        .from("staff")
        .select("id, profile_id, name, avatar, role, email, active, status, phone, tags, languages, licenses")
        .order("name", { ascending: true }),
      supabase
        .from("staff_unavailability")
        .select("id, staff_id, date, all_day, from_time, to_time, reason"),
      supabase.from("profiles").select("id, avatar_url"),
    ]);
    if (staffRes.error) setError(staffRes.error.message);
    else if (unavailRes.error) setError(unavailRes.error.message);
    else {
      setRows((staffRes.data ?? []) as StaffRow[]);
      setUnavail((unavailRes.data ?? []) as UnavailRow[]);
      const map: Record<string, string | null> = {};
      for (const p of (profilesRes.data ?? []) as { id: string; avatar_url: string | null }[]) {
        map[p.id] = p.avatar_url;
      }
      setAvatars(map);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
    const channel = supabase
      .channel("staff-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff" }, (payload) => {
        const newRow = payload.new as StaffRow | null;
        const oldRow = payload.old as { id?: string } | null;
        if (payload.eventType === "INSERT" && newRow) {
          setRows((prev) => (prev.some((r) => r.id === newRow.id) ? prev : [...prev, newRow]));
        } else if (payload.eventType === "UPDATE" && newRow) {
          setRows((prev) => prev.map((r) => (r.id === newRow.id ? { ...r, ...newRow } : r)));
        } else if (payload.eventType === "DELETE" && oldRow?.id) {
          setRows((prev) => prev.filter((r) => r.id !== oldRow.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_unavailability" }, (payload) => {
        const newRow = payload.new as UnavailRow | null;
        const oldRow = payload.old as { id?: string } | null;
        if (payload.eventType === "INSERT" && newRow) {
          setUnavail((prev) => (prev.some((r) => r.id === newRow.id) ? prev : [...prev, newRow]));
        } else if (payload.eventType === "UPDATE" && newRow) {
          setUnavail((prev) => prev.map((r) => (r.id === newRow.id ? { ...r, ...newRow } : r)));
        } else if (payload.eventType === "DELETE" && oldRow?.id) {
          setUnavail((prev) => prev.filter((r) => r.id !== oldRow.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (payload) => {
        const newRow = payload.new as { id?: string; avatar_url?: string | null } | null;
        const oldRow = payload.old as { id?: string } | null;
        if ((payload.eventType === "INSERT" || payload.eventType === "UPDATE") && newRow?.id) {
          setAvatars((prev) => ({ ...prev, [newRow.id!]: newRow.avatar_url ?? null }));
        } else if (payload.eventType === "DELETE" && oldRow?.id) {
          setAvatars((prev) => {
            const next = { ...prev };
            delete next[oldRow.id!];
            return next;
          });
        }
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
      avatarUrl: r.profile_id ? (avatars[r.profile_id] ?? null) : null,
      role: r.role,
      email: r.email,
      active: r.active,
      tags: r.tags ?? [],
      languages: r.languages ?? [],
      licenses: r.licenses ?? [],
      status: r.status,
      phone: r.phone ?? "",
      unavailability: byStaff.get(r.id) ?? [],
    }));
  }, [rows, unavail, avatars]);

  const setUnavailability: StaffStoreContextValue["setUnavailability"] = async (id, list) => {
    // Optimistic local update
    setUnavail((prev) => prev.filter((u) => u.staff_id !== id));
    await supabase.from("staff_unavailability").delete().eq("staff_id", id);
    if (list.length > 0) {
      const payload = list.map((u) => ({
        staff_id: id,
        date: u.date,
        all_day: u.allDay,
        from_time: u.from ? `${u.from}:00` : null,
        to_time: u.to ? `${u.to}:00` : null,
        reason: u.reason ?? null,
      }));
      const { data, error: err } = await supabase
        .from("staff_unavailability")
        .insert(payload)
        .select();
      if (err) {
        setError(err.message);
        void fetchAll();
        return;
      }
      setUnavail((prev) => [...prev, ...((data ?? []) as UnavailRow[])]);
    }
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
    setUnavail((prev) => prev.filter((u) => !(u.staff_id === id && u.date === date)));
    const { error: err } = await supabase
      .from("staff_unavailability")
      .delete()
      .eq("staff_id", id)
      .eq("date", date);
    if (err) {
      setError(err.message);
      void fetchAll();
    }
  };

  const clearMonth: StaffStoreContextValue["clearMonth"] = async (id, yearMonth) => {
    setUnavail((prev) =>
      prev.filter((u) => !(u.staff_id === id && u.date.startsWith(yearMonth))),
    );
    const { error: err } = await supabase
      .from("staff_unavailability")
      .delete()
      .eq("staff_id", id)
      .gte("date", `${yearMonth}-01`)
      .lte("date", `${yearMonth}-31`);
    if (err) {
      setError(err.message);
      void fetchAll();
    }
  };

  const updateProfile: StaffStoreContextValue["updateProfile"] = async (id, patch) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.tags !== undefined) dbPatch.tags = patch.tags;
    if (patch.languages !== undefined) dbPatch.languages = patch.languages;
    if (patch.licenses !== undefined) dbPatch.licenses = patch.licenses;
    if (patch.phone !== undefined) dbPatch.phone = patch.phone;
    // Optimistic update
    setRows((prev) =>
      prev.map((r) => (r.id === id ? ({ ...r, ...(dbPatch as Partial<StaffRow>) }) : r)),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await supabase.from("staff").update(dbPatch as any).eq("id", id);
    if (err) {
      setError(err.message);
      void fetchAll();
    }
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
    const r = data as StaffRow;
    setRows((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
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
    const prevRows = rows;
    setRows((prev) => prev.filter((r) => r.id !== id));
    const { error: err } = await supabase.from("staff").delete().eq("id", id);
    if (err) {
      setError(err.message);
      setRows(prevRows);
    }
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
