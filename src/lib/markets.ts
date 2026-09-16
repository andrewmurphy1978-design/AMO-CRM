// Free, no-key market data sources — delayed, not real-time, per the
// "free tier, delayed" decision. This session's network egress can't reach
// any of these hosts to confirm live behavior, so every fetch here is
// defensive (empty/null on failure, never a thrown error) and records what
// went wrong in `errors` — not shown in the UI, but visible by hitting
// /api/dashboard/markets directly while logged in. Frankfurter (currencies)
// and Yahoo Finance (indices, commodities) are confirmed working from a
// live deploy; CoinGecko (crypto) is confirmed blocked from Cloudflare
// Workers specifically (worked around via a client-side fetch in
// markets-card.tsx).
export interface CurrencyPair {
  code: string;
  countryCode: string;
  rateFromBase: number;
  rateToBase: number;
  changePct: number | null;
}

export interface CryptoPrice {
  id: string;
  label: string;
  logo: string;
  usd: number | null;
  changePct24h: number | null;
}

export interface QuoteItem {
  symbol: string;
  label: string;
  countryCode?: string;
  icon?: string;
  currency: string;
  price: number | null;
  changePct: number | null;
}

export interface MarketsSnapshot {
  base: string;
  baseCountryCode: string;
  currencies: CurrencyPair[];
  indices: QuoteItem[];
  commodities: QuoteItem[];
  crypto: CryptoPrice[];
  fetchedAt: string;
  errors: string[];
}

const CURRENCY_CODES: { code: string; countryCode: string }[] = [
  { code: "USD", countryCode: "us" },
  { code: "EUR", countryCode: "eu" },
  { code: "GBP", countryCode: "gb" },
];

// jsDelivr-hosted CDN build of the widely used spothq/cryptocurrency-icons
// set — free, no key, keyed by lowercase ticker.
function cryptoLogoUrl(ticker: string): string {
  return `https://cdn.jsdelivr.net/npm/cryptocurrency-icons/128/color/${ticker}.png`;
}

// Exported so the client component can also hit CoinGecko directly — see
// the note on getCrypto below for why.
export const CRYPTO_IDS: { id: string; label: string; logo: string }[] = [
  { id: "bitcoin", label: "Bitcoin", logo: cryptoLogoUrl("btc") },
  { id: "ethereum", label: "Ethereum", logo: cryptoLogoUrl("eth") },
];

// Yahoo Finance's ticker conventions — well documented and stable, unlike
// the Stooq symbols this replaced (Stooq quietly started requiring an
// emailed-for, CAPTCHA-gated API key in ~April 2026, which is why its free
// endpoint started 404ing).
const INDEX_SYMBOLS: { symbol: string; label: string; countryCode: string; currency: string }[] = [
  { symbol: "^GSPC", label: "S&P 500", countryCode: "us", currency: "USD" },
  { symbol: "^DJI", label: "Dow Jones", countryCode: "us", currency: "USD" },
  { symbol: "^IXIC", label: "Nasdaq", countryCode: "us", currency: "USD" },
  { symbol: "^GSPTSE", label: "TSX", countryCode: "ca", currency: "CAD" },
  { symbol: "^FTSE", label: "FTSE 100", countryCode: "gb", currency: "GBP" },
  { symbol: "^GDAXI", label: "DAX", countryCode: "de", currency: "EUR" },
  { symbol: "^FCHI", label: "CAC 40", countryCode: "fr", currency: "EUR" },
  { symbol: "^N225", label: "Nikkei 225", countryCode: "jp", currency: "JPY" },
  { symbol: "^HSI", label: "Hang Seng", countryCode: "hk", currency: "HKD" },
];

const COMMODITY_SYMBOLS: { symbol: string; label: string; icon: string; currency: string }[] = [
  { symbol: "GC=F", label: "Gold", icon: "🥇", currency: "USD" },
  { symbol: "BZ=F", label: "Brent crude", icon: "🛢️", currency: "USD" },
  { symbol: "CL=F", label: "WTI crude", icon: "🛢️", currency: "USD" },
];

// Frankfurter (ECB daily reference rates) — https://frankfurter.dev, free,
// no key. Fetches a few days back too, just to compute a day-over-day %
// change; a miss there just means no change figure, not no rates.
async function getCurrencies(base: string, baseCountryCode: string, errors: string[]): Promise<CurrencyPair[]> {
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

    return CURRENCY_CODES.map(({ code, countryCode }) => {
      const rateFromBase = latest.rates?.[code] ?? 0;
      const pastRate = past[code];
      const changePct = pastRate ? ((rateFromBase - pastRate) / pastRate) * 100 : null;
      return {
        code,
        countryCode,
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
      logo: c.logo,
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
async function getYahooQuote<T extends { symbol: string; currency: string }>(item: T, errors: string[]): Promise<T & { price: number | null; changePct: number | null }> {
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

async function getYahooQuotes<T extends { symbol: string; currency: string }>(
  items: T[],
  errors: string[]
): Promise<(T & { price: number | null; changePct: number | null })[]> {
  return Promise.all(items.map((item) => getYahooQuote(item, errors)));
}

export async function getMarketsSnapshot(): Promise<MarketsSnapshot> {
  const errors: string[] = [];
  const [currencies, indices, commodities, crypto] = await Promise.all([
    getCurrencies("CAD", "ca", errors),
    getYahooQuotes(INDEX_SYMBOLS, errors),
    getYahooQuotes(COMMODITY_SYMBOLS, errors),
    getCrypto(errors),
  ]);
  return {
    base: "CAD",
    baseCountryCode: "ca",
    currencies,
    indices,
    commodities,
    crypto,
    fetchedAt: new Date().toISOString(),
    errors,
  };
}
