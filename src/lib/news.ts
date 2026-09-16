// Google News RSS — no API key, real article links (via Google's redirect
// URLs, which is how Google News RSS always works). This session's network
// egress can't reach news.google.com to confirm the feed live, so the
// regex-based parsing below is deliberately defensive: any category that
// fails to fetch or parse just comes back empty instead of throwing.
export interface NewsItem {
  title: string;
  link: string;
}

export type NewsCategoryKey = "local" | "montreal" | "quebec" | "canada" | "us" | "europe" | "world";

export interface NewsCategory {
  key: NewsCategoryKey;
  items: NewsItem[];
}

export interface NewsDigest {
  categories: NewsCategory[];
  fetchedAt: string;
}

interface CategoryQuery {
  key: NewsCategoryKey;
  query?: string;
  topic?: string;
  limit: number;
}

function categoriesFor(lang: "en" | "fr"): CategoryQuery[] {
  return [
    { key: "local", query: "Sainte-Agathe-des-Monts", limit: 1 },
    { key: "montreal", query: lang === "fr" ? "Montréal" : "Montreal", limit: 2 },
    { key: "quebec", query: lang === "fr" ? "Québec province" : "Quebec province", limit: 3 },
    { key: "canada", topic: "NATION", limit: 3 },
    { key: "us", query: lang === "fr" ? "États-Unis" : "United States", limit: 3 },
    { key: "europe", query: "Europe", limit: 3 },
    { key: "world", topic: "WORLD", limit: 3 },
  ];
}

function buildUrl(cat: CategoryQuery, lang: "en" | "fr"): string {
  const hl = lang === "fr" ? "fr-CA" : "en-CA";
  const gl = "CA";
  const ceid = `CA:${lang === "fr" ? "fr" : "en"}`;
  if (cat.topic) {
    return `https://news.google.com/rss/headlines/section/topic/${cat.topic}?hl=${hl}&gl=${gl}&ceid=${ceid}`;
  }
  return `https://news.google.com/rss/search?q=${encodeURIComponent(cat.query ?? "")}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractItems(xml: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) && items.length < limit) {
    const block = match[1];
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    if (titleMatch && linkMatch) {
      items.push({ title: decodeEntities(titleMatch[1].trim()), link: linkMatch[1].trim() });
    }
  }
  return items;
}

export async function getNewsDigest(lang: "en" | "fr"): Promise<NewsDigest> {
  const cats = categoriesFor(lang);
  const categories = await Promise.all(
    cats.map(async (cat): Promise<NewsCategory> => {
      try {
        const res = await fetch(buildUrl(cat, lang), {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AMOCRM/1.0)" },
        });
        if (!res.ok) return { key: cat.key, items: [] };
        const xml = await res.text();
        return { key: cat.key, items: extractItems(xml, cat.limit) };
      } catch {
        return { key: cat.key, items: [] };
      }
    })
  );
  return { categories, fetchedAt: new Date().toISOString() };
}
