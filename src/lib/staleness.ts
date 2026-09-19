// Shared "is this cached snapshot old enough to auto-refresh" check — used
// by the Email page and the Personal page, both of which cache a Gmail
// snapshot in the DB and only hit Gmail again on demand or once it's gone
// stale, rather than on every page load.
const DEFAULT_STALE_MINUTES = 15;

export function isStale(fetchedAtIso: string, staleMinutes: number = DEFAULT_STALE_MINUTES): boolean {
  const ageMs = Date.now() - new Date(fetchedAtIso).getTime();
  return ageMs > staleMinutes * 60 * 1000;
}
