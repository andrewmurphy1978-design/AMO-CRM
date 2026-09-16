// Bing News RSS — no API key, real article links. Switched from Google
// News RSS after a live deploy showed Google returning HTTP 503 on every
// category (Google's bot-detection blocking Cloudflare Workers' shared IP
// range — a real, structural block, not a parsing bug). This session's
// network egress can't reach either host to confirm live, so this is a
// best-effort second attempt: worth checking the `errors` field again
// after deploy in case Bing blocks Workers' IPs too.
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
  errors: string[];
}

interface CategoryQuery {
  key: NewsCategoryKey;
  query: string;
  limit: number;
}

function categoriesFor(lang: "en" | "fr"): CategoryQuery[] {
  return [
    { key: "local", query: "Sainte-Agathe-des-Monts", limit: 1 },
    { key: "montreal", query: lang === "fr" ? "Montréal" : "Montreal", limit: 2 },
    { key: "quebec", query: lang === "fr" ? "Québec province" : "Quebec province", limit: 3 },
    { key: "canada", query: "Canada", limit: 3 },
    { key: "us", query: lang === "fr" ? "États-Unis" : "United States", limit: 3 },
    { key: "europe", query: "Europe", limit: 3 },
    { key: "world", query: lang === "fr" ? "actualités mondiales" : "world news", limit: 3 },
  ];
}

function buildUrl(cat: CategoryQuery, lang: "en" | "fr"): string {
  const setmkt = lang === "fr" ? "fr-CA" : "en-CA";
  return `https://www.bing.com/news/search?q=${encodeURIComponent(cat.query)}&format=RSS&setmkt=${setmkt}`;
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
  const errors: string[] = [];
  const categories = await Promise.all(
    cats.map(async (cat): Promise<NewsCategory> => {
      try {
        const res = await fetch(buildUrl(cat, lang), {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        if (!res.ok) {
          errors.push(`${cat.key}: HTTP ${res.status}`);
          return { key: cat.key, items: [] };
        }
        const xml = await res.text();
        const items = extractItems(xml, cat.limit);
        if (items.length === 0) errors.push(`${cat.key}: 0 items parsed from a ${xml.length}-byte response`);
        return { key: cat.key, items };
      } catch (error) {
        errors.push(`${cat.key}: ${error instanceof Error ? error.message : String(error)}`);
        return { key: cat.key, items: [] };
      }
    })
  );
  return { categories, fetchedAt: new Date().toISOString(), errors };
}
