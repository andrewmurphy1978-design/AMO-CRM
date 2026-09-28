import { getNewsDigest } from "@/lib/news";
import HeaderNewsWidget from "./header-news-widget";
import type { NewsLabels } from "./news-card";

// Dedicated async Server Component so this (real network) fetch sits behind
// its own <Suspense> boundary in the Dashboard header, same reasoning as
// weather-header-server.tsx.
export default async function NewsHeaderServer({ labels }: { labels: NewsLabels }) {
  const digest = await getNewsDigest();
  return <HeaderNewsWidget initial={digest} labels={labels} />;
}
