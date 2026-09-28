import type { PrismaClient } from "@/lib/prisma";

// Defaults + helpers for the customizable World Clock feature: each user
// picks up to 9 IANA zones for their own World Clock card (the Dashboard
// header widget's dropdown, laid out as a 3x3 grid), and up to 2 of those
// to show in the compact header widget itself. Both are stored as plain
// string arrays on User (empty meaning "use these defaults", not the
// defaults baked in — see prisma/schema.prisma) so a future change to the
// defaults still reaches anyone who never customized their own.
export const MAX_WORLD_CLOCK_ZONES = 9;
export const HEADER_CLOCK_COUNT = 2;

// The 8 zones the World Clock card originally shipped with (see the old
// world-clocks.tsx) plus Tokyo — filling out the 3x3 grid with an Asia zone,
// the one region the original 8 didn't cover — now just a fallback instead
// of a hardcoded list.
export const DEFAULT_WORLD_CLOCK_ZONES = [
  "America/Toronto",
  "America/Chicago",
  "America/Denver",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

// Eastern (home) + Paris (the other market this business targets).
export const DEFAULT_HEADER_CLOCK_ZONES = ["America/Toronto", "Europe/Paris"] as const;

export function effectiveWorldClockZones(stored: string[]): string[] {
  return stored.length > 0 ? stored.slice(0, MAX_WORLD_CLOCK_ZONES) : [...DEFAULT_WORLD_CLOCK_ZONES];
}

// `stored` is trusted to already be a subset of `worldZones` (the save
// action enforces that), but this re-filters anyway so a zone dropped from
// `worldZones` after being saved as a header pick never lingers in the
// header widget on its own. When `stored` doesn't fill both slots, this
// fills the rest from DEFAULT_HEADER_CLOCK_ZONES (still filtered to
// worldZones) before falling back to whatever's left in worldZones — so a
// brand-new user (empty stored) sees Toronto+Paris rather than just the
// first 2 zones in worldZones' own order.
export function effectiveHeaderClockZones(stored: string[], worldZones: string[]): string[] {
  const picks = stored.filter((z) => worldZones.includes(z)).slice(0, HEADER_CLOCK_COUNT);
  for (const zone of DEFAULT_HEADER_CLOCK_ZONES) {
    if (picks.length >= HEADER_CLOCK_COUNT) break;
    if (worldZones.includes(zone) && !picks.includes(zone)) picks.push(zone);
  }
  for (const zone of worldZones) {
    if (picks.length >= HEADER_CLOCK_COUNT) break;
    if (!picks.includes(zone)) picks.push(zone);
  }
  return picks;
}

// Reads the signed-in user's own zone picks fresh from the DB — same
// "session is only reissued at login" reasoning as getHour12 in
// src/lib/time-format.ts. `db` has no default on purpose; every caller
// passes its own scoped client (see src/lib/prisma.ts).
export async function getUserWorldClockZones(
  session: { user: { id: string } } | null,
  db: PrismaClient,
): Promise<{ worldZones: string[]; headerZones: string[] }> {
  if (!session) {
    return {
      worldZones: [...DEFAULT_WORLD_CLOCK_ZONES],
      headerZones: [...DEFAULT_HEADER_CLOCK_ZONES],
    };
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { worldClockZones: true, headerClockZones: true },
  });
  const worldZones = effectiveWorldClockZones(user?.worldClockZones ?? []);
  const headerZones = effectiveHeaderClockZones(user?.headerClockZones ?? [], worldZones);
  return { worldZones, headerZones };
}
