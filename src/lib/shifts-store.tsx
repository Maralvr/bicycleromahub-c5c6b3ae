import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Shift } from "./mock-data";
import { isExcludedTourName } from "./excluded-bokun-products";

type ShiftRow = {
  id: string;
  source: Shift["source"];
  booking_id: string | null;
  channel_booking_ref: string | null;
  external_booking_ref: string | null;
  tour_name: string;
  date: string;
  start_time: string;
  end_time: string;
  meeting_point: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  adults: number;
  teens: number;
  infants: number;
  trailers: number;
  participants: { name: string; category: string }[] | null;
  rate: number | string | null;
  rate_title: string | null;
  seller: string | null;
  booking_channel: string | null;
  notes: string | null;
  operations_notes: string | null;
  assigned_staff_id: string | null;
  status: Shift["status"];
  required_tags: string[] | null;
  rental_point_id: string | null;
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
    channelBookingRef: r.channel_booking_ref,
    externalBookingRef: r.external_booking_ref,
    tourName: r.tour_name,
    date: r.date,
    startTime: r.start_time.slice(0, 5),
    endTime: r.end_time.slice(0, 5),
    meetingPoint: r.meeting_point,
    customer:
      r.customer_name || r.customer_phone || r.customer_email
        ? { name: r.customer_name ?? "—", phone: r.customer_phone ?? "—", email: r.customer_email }
        : undefined,
    participants: {
      adults: r.adults,
      teens: r.teens,
      infants: r.infants,
      trailers: r.trailers,
    },
    participantList: r.participants ?? [],
    rate: r.rate != null ? Number(r.rate) : undefined,
    rateTitle: r.rate_title,
    seller: r.seller,
    bookingChannel: r.booking_channel,
    notes: r.notes ?? undefined,
    operationsNotes: r.operations_notes,
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
  if (input.rateTitle !== undefined) out.rate_title = input.rateTitle ?? null;
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
    const pageSize = 1000;
    const all: ShiftRow[] = [];
    let from = 0;
    while (true) {
      const { data, error: err } = await supabase
        .from("shifts")
        .select(
          "id, source, booking_id, channel_booking_ref, external_booking_ref, tour_name, date, start_time, end_time, meeting_point, customer_name, customer_phone, customer_email, adults, teens, infants, trailers, participants, rate, rate_title, seller, booking_channel, notes, operations_notes, assigned_staff_id, status, required_tags",
        )
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .range(from, from + pageSize - 1);
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const batch = (data ?? []) as ShiftRow[];
      all.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    setRows(all);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
    const channel = supabase
      .channel("shifts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => {
        void fetchAll();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const shifts = useMemo<Shift[]>(
    () => rows.filter((r) => !isExcludedTourName(r.tour_name)).map(rowToShift),
    [rows],
  );

  const addShift: ShiftsStoreContextValue["addShift"] = async (input) => {
    const payload = shiftToDbPatch(input);
    const { data, error: err } = await supabase
      .from("shifts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(payload as any)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(shiftToDbPatch(patch) as any)
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
      value={{
        shifts,
        loading,
        error,
        refresh: fetchAll,
        addShift,
        updateShift,
        deleteShift,
        setStatus,
        assignShift,
      }}
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
