import { getMarketsSnapshot } from "@/lib/markets";
import MarketsCard, { type MarketsLabels } from "./markets-card";

export default async function MarketsCardServer({ labels }: { labels: MarketsLabels }) {
  const snapshot = await getMarketsSnapshot();
  return <MarketsCard initial={snapshot} labels={labels} />;
}
