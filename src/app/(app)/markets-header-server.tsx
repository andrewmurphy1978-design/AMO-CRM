import { getMarketsSnapshot, pickMarketsWidgetData } from "@/lib/markets";
import HeaderMarketsWidget from "./header-markets-widget";
import type { MarketsLabels } from "./markets-card";

// Dedicated async Server Component so this (real network) fetch sits behind
// its own <Suspense> boundary in the Dashboard header, same reasoning as
// weather-header-server.tsx. `currency`/`items` come from the signed-in
// user's own picks (see src/lib/dashboard-markets-picks.ts), resolved by
// the caller inside its own withScopedPrismaClient block rather than here,
// so this component never opens its own Prisma client. The full `snapshot`
// is also passed through so the widget's drop-down can render the complete
// Markets card, not just the condensed pill's 4 picks.
export default async function MarketsHeaderServer({
  currency,
  items,
  labels,
}: {
  currency: string;
  items: string[];
  labels: MarketsLabels;
}) {
  const snapshot = await getMarketsSnapshot();
  const pill = pickMarketsWidgetData(snapshot, currency, items);
  return <HeaderMarketsWidget pill={pill} snapshot={snapshot} labels={labels} />;
}
