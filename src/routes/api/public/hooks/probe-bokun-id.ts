import { createFileRoute } from "@tanstack/react-router";

// Diagnostic: try booking-search filters to resolve a confirmation code
// (e.g. BIC-T135626714) to its parentBookingId, then fetch that parent.
// GET /api/public/hooks/probe-bokun-id?code=BIC-T135626714
// (legacy: ?id=135626714 still probes /booking.json/booking/{id})
export const Route = createFileRoute("/api/public/hooks/probe-bokun-id")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const id = url.searchParams.get("id");
        const { bokunFetch } = await import("@/lib/bokun-import.server");

        if (code) {
          const attempts: Array<{ field: string; body: Record<string, unknown> }> = [
            { field: "productConfirmationCode", body: { bookingRole: "SELLER", productConfirmationCode: code, pageSize: 5, page: 1 } },
            { field: "confirmationCode", body: { bookingRole: "SELLER", confirmationCode: code, pageSize: 5, page: 1 } },
            { field: "bookingConfirmationCode", body: { bookingRole: "SELLER", bookingConfirmationCode: code, pageSize: 5, page: 1 } },
            { field: "textFilter", body: { bookingRole: "SELLER", textFilter: code, pageSize: 5, page: 1 } },
            { field: "externalBookingReference", body: { bookingRole: "SELLER", externalBookingReference: code, pageSize: 5, page: 1 } },
          ];
          const summaries: any[] = [];
          for (const a of attempts) {
            try {
              const res: any = await bokunFetch("POST", "/booking.json/booking-search", a.body);
              const items: any[] = res?.results ?? res?.items ?? [];
              summaries.push({
                filter: a.field,
                sentBody: a.body,
                totalHits: res?.totalHits,
                resultsCount: items.length,
                firstRow: items[0]
                  ? {
                      parentBookingId: items[0].parentBookingId,
                      bookingId: items[0].bookingId,
                      id: items[0].id,
                      productConfirmationCode: items[0].productConfirmationCode,
                      confirmationCode: items[0].confirmationCode,
                      productTitle: items[0].productTitle,
                      startDateTime: items[0].startDateTime,
                      status: items[0].status,
                    }
                  : null,
              });
            } catch (e) {
              summaries.push({ filter: a.field, sentBody: a.body, error: (e as Error).message });
            }
          }

          // If any attempt returned a parentBookingId, fetch that parent detail too.
          const winner = summaries.find((s) => s.firstRow?.parentBookingId);
          let parentDetail: any = null;
          if (winner?.firstRow?.parentBookingId) {
            try {
              const detail: any = await bokunFetch(
                "GET",
                `/booking.json/booking/${winner.firstRow.parentBookingId}`,
              );
              const topPcb: any[] | null = Array.isArray(detail?.pricingCategoryBookings)
                ? detail.pricingCategoryBookings
                : null;
              const ab0 = Array.isArray(detail?.activityBookings) ? detail.activityBookings[0] : null;
              const abPcb: any[] | null = Array.isArray(ab0?.pricingCategoryBookings)
                ? ab0.pricingCategoryBookings
                : null;
              const summarizePcb = (arr: any[] | null) =>
                arr?.map((p: any) => ({
                  title: p?.pricingCategory?.title ?? p?.pricingCategory?.fullTitle,
                  quantity: p?.quantity,
                })) ?? null;
              parentDetail = {
                fetchedParentId: winner.firstRow.parentBookingId,
                totalParticipants: detail?.totalParticipants,
                confirmationCode: detail?.confirmationCode,
                productTitle: detail?.productTitle ?? ab0?.productTitle,
                topLevelPcb: summarizePcb(topPcb),
                activityBooking0Pcb: summarizePcb(abPcb),
              };
            } catch (e) {
              parentDetail = { error: (e as Error).message };
            }
          }

          return Response.json({ ok: true, code, attempts: summaries, parentDetail });
        }

        if (id && /^\d+$/.test(id)) {
          try {
            const detail: any = await bokunFetch("GET", `/booking.json/booking/${id}`);
            return Response.json({ ok: true, id, totalParticipants: detail?.totalParticipants, bookingId: detail?.bookingId, parentBookingId: detail?.parentBookingId });
          } catch (e) {
            return Response.json({ ok: false, id, error: (e as Error).message });
          }
        }

        return new Response(JSON.stringify({ error: "provide ?code=BIC-T... or ?id=digits" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
