// Free, no-key market data sources — delayed, not real-time, per the
// "free tier, delayed" decision. This session's network egress can't reach
// any of these hosts to confirm live behavior, so every fetch here is
// defensive (empty/null on failure, never a thrown error) and records what
// went wrong in `errors` — not shown in the UI, but visible by hitting
// /api/dashboard/markets directly while logged in.
export interface CurrencyPair {
  code: string;
  flag: string;
  rateFromBase: number;
  rateToBase: number;
  changePct: number | null;
}

export interface CryptoPrice {
  id: string;
  label: string;
  icon: string;
  usd: number | null;
  changePct24h: number | null;
}

export interface QuoteItem {
  symbol: string;
  label: string;
  icon: string;
  currency: string;
  price: number | null;
  changePct: number | null;
}

export interface MarketsSnapshot {
  base: string;
  baseFlag: string;
  currencies: CurrencyPair[];
  indices: QuoteItem[];
  commodities: QuoteItem[];
  crypto: CryptoPrice[];
  fetchedAt: string;
  errors: string[];
}

const CURRENCY_CODES: { code: string; flag: string }[] = [
  { code: "USD", flag: "🇺🇸" },
  { code: "EUR", flag: "🇪🇺" },
  { code: "GBP", flag: "🇬🇧" },
];

const CRYPTO_IDS: { id: string; label: string; icon: string }[] = [
  { id: "bitcoin", label: "Bitcoin", icon: "₿" },
  { id: "ethereum", label: "Ethereum", icon: "Ξ" },
];

// Stooq symbols recalled from memory, not confirmed live — this session's
// network egress can't reach stooq.com to check them. Most likely spot to
// need a fix once someone can see a real response from it.
const INDEX_SYMBOLS: { symbol: string; label: string; icon: string; currency: string }[] = [
  { symbol: "^ftse", label: "FTSE 100", icon: "🇬🇧", currency: "GBP" },
  { symbol: "^dax", label: "DAX", icon: "🇩🇪", currency: "EUR" },
  { symbol: "^cac", label: "CAC 40", icon: "🇫🇷", currency: "EUR" },
  { symbol: "^nkx", label: "Nikkei 225", icon: "🇯🇵", currency: "JPY" },
  { symbol: "^hsi", label: "Hang Seng", icon: "🇭🇰", currency: "HKD" },
];

const COMMODITY_SYMBOLS: { symbol: string; label: string; icon: string; currency: string }[] = [
  { symbol: "gc.f", label: "Gold", icon: "🥇", currency: "USD" },
  { symbol: "cb.f", label: "Brent crude", icon: "🛢️", currency: "USD" },
  { symbol: "cl.f", label: "WTI crude", icon: "🛢️", currency: "USD" },
];

// Frankfurter (ECB daily reference rates) — https://frankfurter.dev, free,
// no key. Fetches yesterday's rates too, just to compute a day-over-day
// % change; a miss there just means no change figure, not no rates.
async function getCurrencies(base: string, errors: string[]): Promise<CurrencyPair[]> {
  const symbols = CURRENCY_CODES.map((c) => c.code).join(",");
  try {
    const latestRes = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${symbols}`);
    if (!latestRes.ok) {
      errors.push(`frankfurter latest: HTTP ${latestRes.status}`);
      return [];
    }
    const latest = (await latestRes.json()) as { rates?: Record<string, number> };

    let past: Record<string, number> = {};
    try {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const dateStr = yesterday.toISOString().slice(0, 10);
      const pastRes = await fetch(`https://api.frankfurter.dev/v1/${dateStr}?base=${base}&symbols=${symbols}`);
      if (pastRes.ok) {
        const pastData = (await pastRes.json()) as { rates?: Record<string, number> };
        past = pastData.rates ?? {};
      }
    } catch {
      // % change is a nice-to-have; missing history shouldn't hide the rates.
    }

    return CURRENCY_CODES.map(({ code, flag }) => {
      const rateFromBase = latest.rates?.[code] ?? 0;
      const pastRate = past[code];
      const changePct = pastRate ? ((rateFromBase - pastRate) / pastRate) * 100 : null;
      return {
        code,
        flag,
        rateFromBase,
        rateToBase: rateFromBase ? 1 / rateFromBase : 0,
        changePct,
      };
    });
  } catch (error) {
    errors.push(`frankfurter: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

// CoinGecko's public "simple price" endpoint — free, no key.
async function getCrypto(errors: string[]): Promise<CryptoPrice[]> {
  const empty = CRYPTO_IDS.map((c) => ({ ...c, usd: null, changePct24h: null }));
  try {
    const ids = CRYPTO_IDS.map((c) => c.id).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
    );
    if (!res.ok) {
      errors.push(`coingecko: HTTP ${res.status}`);
      return empty;
    }
    const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
    return CRYPTO_IDS.map((c) => ({
      id: c.id,
      label: c.label,
      icon: c.icon,
      usd: data[c.id]?.usd ?? null,
      changePct24h: data[c.id]?.usd_24h_change ?? null,
    }));
  } catch (error) {
    errors.push(`coingecko: ${error instanceof Error ? error.message : String(error)}`);
    return empty;
  }
}

// Stooq's free CSV quote endpoint (no key) — this is the one piece of the
// Markets card built from documentation recalled rather than a live check,
// since this session can't reach stooq.com to confirm the CSV column order.
async function getStooqQuotes(
  items: { symbol: string; label: string; icon: string; currency: string }[],
  errors: string[]
): Promise<QuoteItem[]> {
  const empty = items.map((i) => ({ ...i, price: null, changePct: null }));
  try {
    const symbols = items.map((i) => i.symbol).join(",");
    const res = await fetch(`https://stooq.com/q/l/?s=${symbols}&f=sd2t2c2p2&h&e=csv`);
    if (!res.ok) {
      errors.push(`stooq (${symbols}): HTTP ${res.status}`);
      return empty;
    }
    const text = await res.text();
    const lines = text.trim().split("\n").slice(1);
    const bySymbol = new Map<string, { price: number | null; changePct: number | null }>();
    for (const line of lines) {
      const cols = line.split(",");
      const symbol = cols[0]?.toLowerCase();
      const price = Number(cols[3]);
      const changePct = Number(cols[4]);
      if (symbol) {
        bySymbol.set(symbol, {
          price: Number.isFinite(price) ? price : null,
          changePct: Number.isFinite(changePct) ? changePct : null,
        });
      }
    }
    return items.map((i) => {
      const found = bySymbol.get(i.symbol.toLowerCase());
      return { ...i, price: found?.price ?? null, changePct: found?.changePct ?? null };
    });
  } catch (error) {
    errors.push(`stooq (${items.map((i) => i.symbol).join(",")}): ${error instanceof Error ? error.message : String(error)}`);
    return empty;
  }
}

export async function getMarketsSnapshot(): Promise<MarketsSnapshot> {
  const errors: string[] = [];
  const [currencies, indices, commodities, crypto] = await Promise.all([
    getCurrencies("CAD", errors),
    getStooqQuotes(INDEX_SYMBOLS, errors),
    getStooqQuotes(COMMODITY_SYMBOLS, errors),
    getCrypto(errors),
  ]);
  return {
    base: "CAD",
    baseFlag: "🇨🇦",
    currencies,
    indices,
    commodities,
    crypto,
    fetchedAt: new Date().toISOString(),
    errors,
  };
}
