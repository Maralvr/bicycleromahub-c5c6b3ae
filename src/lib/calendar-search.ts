import type { View } from "@/components/shifts-calendar";

/**
 * The calendar's browsed position (`?date=` + `?view=`) and the open booking
 * dialog (`?shift=`) live in the URL so they survive ANY remount of
 * <ShiftsCalendar /> -- Radix tab panels unmounting, closing a booking dialog,
 * a transient auth/loading frame in the route, browser back, or the remount
 * that happens when the browser tab regains focus. Previously these were plain
 * component-local state and reset whenever the component was torn down.
 */
export type CalendarSearch = { date?: string; view?: View; shift?: string };

export function parseCalendarSearch(search: Record<string, unknown>): CalendarSearch {
  const date = search.date;
  const view = search.view;
  const shift = search.shift;
  return {
    date: typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    view: view === "day" || view === "week" || view === "month" ? view : undefined,
    shift: typeof shift === "string" && shift.length > 0 ? shift : undefined,
  };
}

/**
 * Wires <ShiftsCalendar /> position + open booking to a route's
 * ?date=/?view=/?shift= params.
 * `route` is any TanStack file route exposing useSearch/useNavigate whose
 * search type includes CalendarSearch.
 */
export function useCalendarUrlState(route: {
  useSearch: () => CalendarSearch;
  useNavigate: () => (opts: {
    search: (prev: CalendarSearch) => CalendarSearch;
    replace?: boolean;
  }) => unknown;
}) {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  return {
    date: search.date,
    view: search.view,
    shiftId: search.shift,
    onDateChange: (date: string) =>
      navigate({ search: (prev) => ({ ...prev, date }), replace: true }),
    onViewChange: (view: View) =>
      navigate({ search: (prev) => ({ ...prev, view }), replace: true }),
    onShiftIdChange: (shift: string | null) =>
      navigate({ search: (prev) => ({ ...prev, shift: shift ?? undefined }), replace: true }),
  };
}
