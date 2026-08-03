import type { View } from "@/components/shifts-calendar";

/**
 * The calendar's browsed position (`?date=` + `?view=`) lives in the URL so it
 * survives ANY remount of <ShiftsCalendar /> -- Radix tab panels unmounting,
 * closing a booking dialog, a transient auth/loading frame in the route, or
 * browser back. Previously it was plain component-local state and reset to
 * "today" whenever the component was torn down.
 */
export type CalendarSearch = { date?: string; view?: View };

export function parseCalendarSearch(search: Record<string, unknown>): CalendarSearch {
  console.log("[calendar-debug][parseCalendarSearch]", new Date().toISOString(), {
    rawSearch: search,
    href: typeof window !== "undefined" ? window.location.href : "ssr",
  });
  const date = search.date;
  const view = search.view;
  return {
    date: typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    view: view === "day" || view === "week" || view === "month" ? view : undefined,
  };
}

/**
 * Wires <ShiftsCalendar /> position to a route's ?date=/?view= params.
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
    onDateChange: (date: string) =>
      navigate({ search: (prev) => ({ ...prev, date }), replace: true }),
    onViewChange: (view: View) =>
      navigate({ search: (prev) => ({ ...prev, view }), replace: true }),
  };
}
