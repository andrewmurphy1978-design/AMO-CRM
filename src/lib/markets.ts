// Free, no-key market data sources — delayed, not real-time, per the
// "free tier, delayed" decision. This session's network egress can't reach
// any of these hosts to confirm live behavior, so every fetch here is
// defensive (empty/null on failure, never a thrown error) and records what
// went wrong in `errors` — not shown in the UI, but visible by hitting
// /api/dashboard/markets directly while logged in. Frankfurter (currencies)
// is confirmed working from a live deploy; CoinGecko (crypto) is confirmed
// blocked from Cloudflare Workers specifically (worked around via a
// client-side fetch in markets-card.tsx); Yahoo Finance (indices,
// commodities) replaced Stooq after Stooq's free endpoint started requiring
// an API key and hasn't been checked live yet.
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

// Exported so the client component can also hit CoinGecko directly — see
// the note on getCrypto below for why.
export const CRYPTO_IDS: { id: string; label: string; icon: string }[] = [
  { id: "bitcoin", label: "Bitcoin", icon: "₿" },
  { id: "ethereum", label: "Ethereum", icon: "Ξ" },
];

// Yahoo Finance's ticker conventions — well documented and stable, unlike
// the Stooq symbols this replaced (Stooq quietly started requiring an
// emailed-for, CAPTCHA-gated API key in ~April 2026, which is why its free
// endpoint started 404ing).
const INDEX_SYMBOLS: { symbol: string; label: string; icon: string; currency: string }[] = [
  { symbol: "^FTSE", label: "FTSE 100", icon: "🇬🇧", currency: "GBP" },
  { symbol: "^GDAXI", label: "DAX", icon: "🇩🇪", currency: "EUR" },
  { symbol: "^FCHI", label: "CAC 40", icon: "🇫🇷", currency: "EUR" },
  { symbol: "^N225", label: "Nikkei 225", icon: "🇯🇵", currency: "JPY" },
  { symbol: "^HSI", label: "Hang Seng", icon: "🇭🇰", currency: "HKD" },
];

const COMMODITY_SYMBOLS: { symbol: string; label: string; icon: string; currency: string }[] = [
  { symbol: "GC=F", label: "Gold", icon: "🥇", currency: "USD" },
  { symbol: "BZ=F", label: "Brent crude", icon: "🛢️", currency: "USD" },
  { symbol: "CL=F", label: "WTI crude", icon: "🛢️", currency: "USD" },
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
      // 4 days back, not 1 — the ECB doesn't publish rates on weekends, so
      // "yesterday" on a Monday would just echo Friday's already-latest
      // rate and show a flat 0.00% for every currency.
      const lookback = new Date();
      lookback.setUTCDate(lookback.getUTCDate() - 4);
      const dateStr = lookback.toISOString().slice(0, 10);
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

// CoinGecko's public "simple price" endpoint — free, no key. A live deploy
// showed this returning HTTP 403 from Cloudflare Workers (CoinGecko is
// known to block cloud/proxy IP ranges, Cloudflare's shared edge among
// them), so this server-side call is now just a fallback — the card's
// client component also calls CoinGecko directly from the visitor's own
// browser, which isn't behind that block.
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

// Yahoo Finance's unofficial (but widely used — it's what the `yfinance`
// Python library wraps) chart endpoint. Undocumented and can change without
// notice, but confirmed working keyless as of mid-2026, unlike Stooq's now
// key-gated one. One request per symbol; `meta.regularMarketPrice` and
// `meta.previousClose` give both the quote and a same-request % change.
async function getYahooQuote(
  item: { symbol: string; label: string; icon: string; currency: string },
  errors: string[]
): Promise<QuoteItem> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.symbol)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      errors.push(`yahoo (${item.symbol}): HTTP ${res.status}`);
      return { ...item, price: null, changePct: null };
    }
    const data = (await res.json()) as {
      chart?: {
        result?: { meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number } }[];
      };
    };
    const meta = data.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? null;
    const prevClose = meta?.previousClose ?? meta?.chartPreviousClose ?? null;
    if (price === null) errors.push(`yahoo (${item.symbol}): no regularMarketPrice in response`);
    const changePct = price !== null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
    return { ...item, price, changePct };
  } catch (error) {
    errors.push(`yahoo (${item.symbol}): ${error instanceof Error ? error.message : String(error)}`);
    return { ...item, price: null, changePct: null };
  }
}

async function getYahooQuotes(
  items: { symbol: string; label: string; icon: string; currency: string }[],
  errors: string[]
): Promise<QuoteItem[]> {
  return Promise.all(items.map((item) => getYahooQuote(item, errors)));
}

export async function getMarketsSnapshot(): Promise<MarketsSnapshot> {
  const errors: string[] = [];
  const [currencies, indices, commodities, crypto] = await Promise.all([
    getCurrencies("CAD", errors),
    getYahooQuotes(INDEX_SYMBOLS, errors),
    getYahooQuotes(COMMODITY_SYMBOLS, errors),
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
