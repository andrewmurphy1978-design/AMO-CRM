import { getNewsDigest } from "@/lib/news";
import NewsCard, { type NewsLabels } from "./news-card";

export default async function NewsCardServer({ labels }: { labels: NewsLabels }) {
  const digest = await getNewsDigest();
  return <NewsCard initial={digest} labels={labels} />;
}
