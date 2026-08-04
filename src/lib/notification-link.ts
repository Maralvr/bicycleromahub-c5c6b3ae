/**
 * Shared deep-link resolution for notifications.
 *
 * Notification rows historically stored generic links like "/shifts" or
 * "/tasks", so clicking a "New shift assigned" notification dropped the user on
 * a list instead of the booking it was about. Every notification that carries a
 * shift_id now resolves to `/shifts?shift=<id>` (the shifts page opens that
 * booking's detail dialog from the `?shift=` param), while keeping any
 * already-specific link (e.g. `?rental_day=<id>`) untouched.
 */

export type NotificationLinkInput = {
  link?: string | null;
  shiftId?: string | null;
};

const GENERIC_LINKS = new Set(["/shifts", "/calendar", "/notifications", "/", ""]);

export function resolveNotificationLink(n: NotificationLinkInput): string | null {
  const link = n.link?.trim() || "";
  const hasParams = link.includes("?");
  // A stored link that already targets something specific wins.
  if (link && (hasParams || !GENERIC_LINKS.has(link))) return link;
  if (n.shiftId) return `/shifts?shift=${encodeURIComponent(n.shiftId)}`;
  return link || null;
}

/** Navigate to a notification link, preserving its query string. */
export function navigateToNotificationLink(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigate: (opts: any) => unknown,
  rawLink: string,
) {
  try {
    const url = new URL(rawLink, window.location.origin);
    const search = Object.fromEntries(url.searchParams);
    navigate({ to: url.pathname, search });
  } catch {
    navigate({ to: rawLink.split("?")[0], search: {} });
  }
}
