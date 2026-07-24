import { createFileRoute } from "@tanstack/react-router";

// Temporary diagnostic endpoint: GET /api/public/hooks/probe-bokun-id?id=135626714
// Returns a summary of what Bokun's /booking.json/booking/{id} returns
// so we can decide whether the activityBookingId embedded in booking_id
// is a valid fetch target for the heal path.
export const Route = createFileRoute("/api/public/hooks/probe-bokun-id")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id || !/^\d+$/.test(id)) {
          return new Response(JSON.stringify({ error: "id query param required (digits only)" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const { bokunFetch } = await import("@/lib/bokun-import.server");
          const detail: any = await bokunFetch("GET", `/booking.json/booking/${id}`);
          const topPcb = Array.isArray(detail?.pricingCategoryBookings) ? detail.pricingCategoryBookings : null;
          const ab0 = Array.isArray(detail?.activityBookings) ? detail.activityBookings[0] : null;
          const abPcb = Array.isArray(ab0?.pricingCategoryBookings) ? ab0.pricingCategoryBookings : null;
          const summarizePcb = (arr: any[] | null) =>
            arr?.map((p) => ({
              title: p?.pricingCategory?.title ?? p?.pricingCategory?.fullTitle,
              quantity: p?.quantity,
              hasLeadPassenger: !!p?.leadPassenger,
              passengerCount: Array.isArray(p?.passengers) ? p.passengers.length : 0,
            })) ?? null;
          return Response.json({
            ok: true,
            id,
            totalParticipants: detail?.totalParticipants,
            parentBookingId: detail?.parentBookingId,
            bookingId: detail?.bookingId,
            confirmationCode: detail?.confirmationCode,
            productTitle: detail?.productTitle ?? ab0?.productTitle,
            status: detail?.status ?? ab0?.status,
            startDateTime: ab0?.startDateTime,
            topLevelPcb: summarizePcb(topPcb),
            activityBooking0Pcb: summarizePcb(abPcb),
          });
        } catch (e) {
          return Response.json({ ok: false, id, error: (e as Error).message });
        }
      },
    },
  },
});
