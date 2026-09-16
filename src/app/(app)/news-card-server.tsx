import { getNewsDigest } from "@/lib/news";
import NewsCard, { type NewsLabels } from "./news-card";

export default async function NewsCardServer({ lang, labels }: { lang: "en" | "fr"; labels: NewsLabels }) {
  const digest = await getNewsDigest(lang);
  return <NewsCard initial={digest} lang={lang} labels={labels} />;
}
