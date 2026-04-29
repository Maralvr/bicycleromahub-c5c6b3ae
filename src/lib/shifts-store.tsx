import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Shift } from "./mock-data";

type ShiftRow = {
  id: string;
  source: Shift["source"];
  booking_id: string | null;
  tour_name: string;
  date: string;
  start_time: string;
  end_time: string;
  meeting_point: string;
  customer_name: string | null;
  customer_phone: string | null;
  adults: number;
  teens: number;
  infants: number;
  trailers: number;
  rate: number | string | null;
  notes: string | null;
  assigned_staff_id: string | null;
  status: Shift["status"];
  required_tags: string[] | null;
};

type NewShiftInput = Omit<Shift, "id" | "guideNotes">;
type ShiftPatch = Partial<NewShiftInput>;

type ShiftsStoreContextValue = {
  shifts: Shift[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addShift: (input: NewShiftInput) => Promise<Shift | null>;
  updateShift: (id: string, patch: ShiftPatch) => Promise<void>;
  deleteShift: (id: string) => Promise<void>;
  setStatus: (id: string, status: Shift["status"]) => Promise<void>;
  assignShift: (id: string, assignedStaffId: string | null) => Promise<void>;
};

const ShiftsStoreContext = createContext<ShiftsStoreContextValue | null>(null);

function rowToShift(r: ShiftRow): Shift {
  return {
    id: r.id,
    source: r.source,
    bookingId: r.booking_id ?? undefined,
    tourName: r.tour_name,
    date: r.date,
    startTime: r.start_time.slice(0, 5),
    endTime: r.end_time.slice(0, 5),
    meetingPoint: r.meeting_point,
    customer:
      r.customer_name || r.customer_phone
        ? { name: r.customer_name ?? "—", phone: r.customer_phone ?? "—" }
        : undefined,
    participants: {
      adults: r.adults,
      teens: r.teens,
      infants: r.infants,
      trailers: r.trailers,
    },
    rate: r.rate != null ? Number(r.rate) : undefined,
    notes: r.notes ?? undefined,
    assignedStaffId: r.assigned_staff_id,
    status: r.status,
    requiredTags: r.required_tags ?? [],
  };
}

function shiftToDbPatch(input: ShiftPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.source !== undefined) out.source = input.source;
  if (input.bookingId !== undefined) out.booking_id = input.bookingId ?? null;
  if (input.tourName !== undefined) out.tour_name = input.tourName;
  if (input.date !== undefined) out.date = input.date;
  if (input.startTime !== undefined) out.start_time = `${input.startTime}:00`;
  if (input.endTime !== undefined) out.end_time = `${input.endTime}:00`;
  if (input.meetingPoint !== undefined) out.meeting_point = input.meetingPoint;
  if (input.customer !== undefined) {
    out.customer_name = input.customer?.name ?? null;
    out.customer_phone = input.customer?.phone ?? null;
  }
  if (input.participants !== undefined) {
    out.adults = input.participants?.adults ?? 0;
    out.teens = input.participants?.teens ?? 0;
    out.infants = input.participants?.infants ?? 0;
    out.trailers = input.participants?.trailers ?? 0;
  }
  if (input.rate !== undefined) out.rate = input.rate ?? null;
  if (input.notes !== undefined) out.notes = input.notes ?? null;
  if (input.assignedStaffId !== undefined) out.assigned_staff_id = input.assignedStaffId;
  if (input.status !== undefined) out.status = input.status;
  if (input.requiredTags !== undefined) out.required_tags = input.requiredTags ?? [];
  return out;
}

export function ShiftsStoreProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("shifts")
      .select(
        "id, source, booking_id, tour_name, date, start_time, end_time, meeting_point, customer_name, customer_phone, adults, teens, infants, trailers, rate, notes, assigned_staff_id, status, required_tags",
      )
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });
    if (err) setError(err.message);
    else {
      setRows((data ?? []) as ShiftRow[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
    const channel = supabase
      .channel("shifts-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shifts" },
        () => {
          void fetchAll();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const shifts = useMemo<Shift[]>(() => rows.map(rowToShift), [rows]);

  const addShift: ShiftsStoreContextValue["addShift"] = async (input) => {
    const payload = shiftToDbPatch(input);
    const { data, error: err } = await supabase
      .from("shifts")
      .insert(payload)
      .select()
      .single();
    if (err) {
      setError(err.message);
      return null;
    }
    await fetchAll();
    return rowToShift(data as ShiftRow);
  };

  const updateShift: ShiftsStoreContextValue["updateShift"] = async (id, patch) => {
    const { error: err } = await supabase
      .from("shifts")
      .update(shiftToDbPatch(patch))
      .eq("id", id);
    if (err) setError(err.message);
    await fetchAll();
  };

  const deleteShift: ShiftsStoreContextValue["deleteShift"] = async (id) => {
    const { error: err } = await supabase.from("shifts").delete().eq("id", id);
    if (err) setError(err.message);
    await fetchAll();
  };

  const setStatus: ShiftsStoreContextValue["setStatus"] = async (id, status) => {
    await updateShift(id, { status });
  };

  const assignShift: ShiftsStoreContextValue["assignShift"] = async (id, assignedStaffId) => {
    await updateShift(id, {
      assignedStaffId,
      status: assignedStaffId ? "pending" : "unassigned",
    });
  };

  return (
    <ShiftsStoreContext.Provider
      value={{ shifts, loading, error, refresh: fetchAll, addShift, updateShift, deleteShift, setStatus, assignShift }}
    >
      {children}
    </ShiftsStoreContext.Provider>
  );
}

export function useShiftsStore() {
  const ctx = useContext(ShiftsStoreContext);
  if (!ctx) throw new Error("useShiftsStore must be used within ShiftsStoreProvider");
  return ctx;
}
