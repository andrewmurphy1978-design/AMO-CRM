import { getSportsSnapshot } from "@/lib/sports";
import SportsCard, { type SportsLabels } from "./sports-card";

export default async function SportsCardServer({
  labels,
  lang,
  hour12,
}: {
  labels: SportsLabels;
  lang: "en" | "fr";
  hour12: boolean;
}) {
  const snapshot = await getSportsSnapshot();
  return <SportsCard initial={snapshot} labels={labels} lang={lang} hour12={hour12} />;
}
