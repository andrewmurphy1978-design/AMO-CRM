import { getMarketsSnapshot, pickMarketsWidgetData } from "@/lib/markets";
import HeaderMarketsWidget from "./header-markets-widget";
import type { MarketsLabels } from "./markets-card";

// Dedicated async Server Component so this (real network) fetch sits behind
// its own <Suspense> boundary in the Dashboard header, same reasoning as
// weather-header-server.tsx. `currency`/`items` come from the signed-in
// user's own picks (see src/lib/dashboard-markets-picks.ts), resolved by
// the caller inside its own withScopedPrismaClient block rather than here,
// so this component never opens its own Prisma client.
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
  const data = pickMarketsWidgetData(snapshot, currency, items);
  return <HeaderMarketsWidget initial={data} labels={labels} />;
}
