import type { PrismaClient } from "@/lib/prisma";

// Which Dashboard header widgets a user can individually show/hide —
// Weather, News, and Sports live in the logoAccessory slot (left side);
// Markets and World Clock live in the dateTimeAccessory slot; the Date/
// Time/Location card is its own fixed element at the far right. Stored as
// a plain string array on User (empty meaning "show everything", not
// baked-in defaults) — same reasoning as every other Dashboard header
// pick in this app (world-clock-zones.ts, dashboard-markets-picks.ts,
// dashboard-sports-picks.ts).
export const HEADER_WIDGET_KEYS = ["weather", "news", "sports", "markets", "worldClock", "dateTime"] as const;
export type HeaderWidgetKey = (typeof HEADER_WIDGET_KEYS)[number];

export function effectiveHiddenHeaderWidgets(stored: string[]): HeaderWidgetKey[] {
  return stored.filter((key): key is HeaderWidgetKey => (HEADER_WIDGET_KEYS as readonly string[]).includes(key));
}

// Reads the signed-in user's own hidden-widget picks fresh from the DB —
// same "session is only reissued at login" reasoning as getHour12 in
// src/lib/time-format.ts.
export async function getUserHiddenHeaderWidgets(
  session: { user: { id: string } } | null,
  db: PrismaClient,
): Promise<HeaderWidgetKey[]> {
  if (!session) return [];
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { hiddenHeaderWidgets: true },
  });
  return effectiveHiddenHeaderWidgets(user?.hiddenHeaderWidgets ?? []);
}
