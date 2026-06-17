import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

// -------------------- rental_staff CRUD (admin) --------------------

export const listRentalStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("rental_staff")
      .select("id, profile_id, name, email, phone, avatar, active, created_at")
      .order("name");
    if (error) throw new Error(error.message);
    return { staff: data ?? [] };
  });

type UpsertRentalStaffInput = {
  id?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  avatar?: string | null;
  active?: boolean;
};

export const upsertRentalStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpsertRentalStaffInput) => {
    if (!input?.name?.trim()) throw new Error("Name is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const row = {
      name: data.name.trim(),
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      avatar: (data.avatar?.trim() || data.name.trim().slice(0, 2)).toUpperCase(),
      active: data.active ?? true,
    };
    if (data.id) {
      const { error } = await supabase.from("rental_staff").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabase
      .from("rental_staff")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id };
  });

export const deleteRentalStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("rental_staff").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Assignments (admin) --------------------

export const listAssignmentsForPoint = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pointId: string; from: string; to: string }) => {
    if (!input?.pointId || !input?.from || !input?.to) throw new Error("pointId, from, to required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: rows, error } = await supabase
      .from("rental_point_day_assignments")
      .select("id, rental_point_id, rental_staff_id, date, notes, created_at")
      .eq("rental_point_id", data.pointId)
      .gte("date", data.from)
      .lte("date", data.to)
      .order("date");
    if (error) throw new Error(error.message);
    return { assignments: rows ?? [] };
  });

export const assignRentalStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pointId: string; staffId: string; date: string; notes?: string }) => {
    if (!input?.pointId || !input?.staffId || !input?.date) {
      throw new Error("pointId, staffId, date required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: ins, error } = await supabase
      .from("rental_point_day_assignments")
      .insert({
        rental_point_id: data.pointId,
        rental_staff_id: data.staffId,
        date: data.date,
        notes: data.notes?.trim() || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) {
      // Unique violation = already assigned; treat as success
      if ((error as any).code === "23505") return { ok: true, alreadyAssigned: true };
      throw new Error(error.message);
    }
    return { ok: true, id: ins!.id };
  });

export const unassignRentalStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("rental_point_day_assignments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Rental-staff view --------------------

export type MyRentalDay = {
  assignmentId: string;
  date: string;
  notes: string | null;
  status: "pending" | "accepted";
  pendingExpiresAt: string | null;
  rentalPoint: { id: string; name: string; address: string | null; phone: string | null };
  bookings: Array<{
    id: string;
    tourName: string;
    startTime: string;
    endTime: string | null;
    rateTitle: string | null;
    meetingPoint: string | null;
    pax: number;
    adults: number;
    teens: number;
    infants: number;
    trailers: number;
    customerName: string | null;
    customerPhone: string | null;
    customerEmail: string | null;
    notes: string | null;
    bookingRef: string | null;
    guide: { id: string; name: string; avatar: string; phone: string | null } | null;
  }>;
};

export const getMyRentalDays = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from?: string; to?: string }) => input ?? {})
  .handler(async ({ data, context }): Promise<{ days: MyRentalDay[] }> => {
    const { supabase, userId } = context;
    // Resolve rental_staff row(s) for this user
    const { data: staffRow, error: sErr } = await supabase
      .from("rental_staff")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!staffRow) return { days: [] };

    const from = data.from ?? new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const to = data.to ?? new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);

    const { data: assigns, error: aErr } = await supabase
      .from("rental_point_day_assignments")
      .select(
        "id, date, notes, status, pending_expires_at, rental_point_id, rental_points (id, name, address, phone)",
      )
      .eq("rental_staff_id", staffRow.id)
      .gte("date", from)
      .lte("date", to)
      .order("date");
    if (aErr) throw new Error(aErr.message);
    if (!assigns?.length) return { days: [] };

    const pointIds = Array.from(new Set(assigns.map((a) => a.rental_point_id)));
    const dates = Array.from(new Set(assigns.map((a) => a.date)));

    const { data: shifts, error: shErr } = await supabase
      .from("shifts")
      .select(
        "id, tour_name, date, start_time, end_time, meeting_point, rate_title, adults, teens, infants, trailers, participants, customer_name, customer_phone, customer_email, notes, booking_id, channel_booking_ref, assigned_staff_id, rental_point_id",
      )
      .in("rental_point_id", pointIds)
      .in("date", dates);
    if (shErr) throw new Error(shErr.message);

    const guideIds = Array.from(
      new Set((shifts ?? []).map((s) => s.assigned_staff_id).filter(Boolean) as string[]),
    );
    let guidesById = new Map<string, { id: string; name: string; avatar: string; phone: string | null }>();
    if (guideIds.length) {
      const { data: guides, error: gErr } = await supabase
        .from("staff")
        .select("id, name, avatar, phone")
        .in("id", guideIds);
      if (gErr) throw new Error(gErr.message);
      guidesById = new Map((guides ?? []).map((g) => [g.id, g]));
    }

    const paxParts = (s: any) => {
      const p = s.participants;
      let a = Number(s.adults ?? 0);
      let t = Number(s.teens ?? 0);
      let i = Number(s.infants ?? 0);
      if (p && typeof p === "object") {
        const pa = Number(p.adults ?? 0), pt = Number(p.teens ?? 0), pi = Number(p.infants ?? 0);
        if (pa + pt + pi > 0) {
          a = pa;
          t = pt;
          i = pi;
        }
      }
      return { adults: a, teens: t, infants: i, total: a + t + i };
    };

    const days: MyRentalDay[] = assigns.map((a: any) => {
      const ds = (shifts ?? []).filter(
        (s) => s.rental_point_id === a.rental_point_id && s.date === a.date,
      );
      return {
        assignmentId: a.id,
        date: a.date,
        notes: a.notes ?? null,
        status: (a.status ?? "accepted") as "pending" | "accepted",
        pendingExpiresAt: a.pending_expires_at ?? null,
        rentalPoint: {
          id: a.rental_points?.id ?? a.rental_point_id,
          name: a.rental_points?.name ?? "",
          address: a.rental_points?.address ?? null,
          phone: a.rental_points?.phone ?? null,
        },
        bookings: ds
          .sort((x, y) => (x.start_time ?? "").localeCompare(y.start_time ?? ""))
          .map((s) => {
            const parts = paxParts(s);
            return {
              id: s.id,
              tourName: s.tour_name ?? "",
              startTime: (s.start_time ?? "").slice(0, 5),
              endTime: s.end_time ? s.end_time.slice(0, 5) : null,
              rateTitle: s.rate_title ?? null,
              meetingPoint: s.meeting_point ?? null,
              pax: parts.total,
              adults: parts.adults,
              teens: parts.teens,
              infants: parts.infants,
              trailers: Number(s.trailers ?? 0),
              customerName: s.customer_name ?? null,
              customerPhone: s.customer_phone ?? null,
              customerEmail: s.customer_email ?? null,
              notes: s.notes ?? null,
              bookingRef: s.channel_booking_ref ?? s.booking_id ?? null,
              guide: s.assigned_staff_id ? guidesById.get(s.assigned_staff_id) ?? null : null,
            };
          }),
      };
    });

    return { days };
  });

// -------------------- Notifications --------------------

export const listMyRentalNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: staffRow } = await supabase
      .from("rental_staff")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!staffRow) return { notifications: [] };
    const { data, error } = await supabase
      .from("rental_staff_notifications")
      .select("id, type, title, body, link, read, created_at, rental_point_id, date")
      .eq("rental_staff_id", staffRow.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { notifications: data ?? [] };
  });

export const markRentalNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; all?: boolean }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staffRow } = await supabase
      .from("rental_staff")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!staffRow) return { ok: true };
    let q = supabase
      .from("rental_staff_notifications")
      .update({ read: true })
      .eq("rental_staff_id", staffRow.id);
    if (data.id) q = q.eq("id", data.id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
