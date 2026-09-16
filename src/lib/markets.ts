// Free, no-key market data sources — delayed, not real-time, per the
// "free tier, delayed" decision. This session's network egress can't reach
// any of these hosts to confirm live behavior, so every fetch here is
// defensive (empty array/nulls on failure, never a thrown error) and each
// group degrades independently.
export interface CurrencyRate {
  code: string;
  rate: number;
}

export interface CryptoPrice {
  id: string;
  label: string;
  usd: number | null;
  changePct24h: number | null;
}

export interface QuoteItem {
  symbol: string;
  label: string;
  price: number | null;
}

export interface MarketsSnapshot {
  base: string;
  currencies: CurrencyRate[];
  crypto: CryptoPrice[];
  indices: QuoteItem[];
  commodities: QuoteItem[];
  fetchedAt: string;
}

const CRYPTO_IDS: { id: string; label: string }[] = [
  { id: "bitcoin", label: "BTC" },
  { id: "ethereum", label: "ETH" },
  { id: "solana", label: "SOL" },
  { id: "dogecoin", label: "DOGE" },
];

const INDEX_SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: "^spx", label: "S&P 500" },
  { symbol: "^dji", label: "Dow Jones" },
  { symbol: "^ndq", label: "Nasdaq" },
  { symbol: "^tsx", label: "TSX" },
];

const COMMODITY_SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: "gc.f", label: "Gold" },
  { symbol: "si.f", label: "Silver" },
  { symbol: "cl.f", label: "Crude oil" },
  { symbol: "ng.f", label: "Nat. gas" },
];

// Frankfurter (ECB daily reference rates) — https://frankfurter.dev, free,
// no key.
async function getCurrencies(base: string): Promise<CurrencyRate[]> {
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=USD,EUR,GBP`);
    if (!res.ok) return [];
    const data = (await res.json()) as { rates?: Record<string, number> };
    return Object.entries(data.rates ?? {}).map(([code, rate]) => ({ code, rate }));
  } catch {
    return [];
  }
}

// CoinGecko's public "simple price" endpoint — free, no key.
async function getCrypto(): Promise<CryptoPrice[]> {
  try {
    const ids = CRYPTO_IDS.map((c) => c.id).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
    );
    if (!res.ok) return CRYPTO_IDS.map((c) => ({ ...c, usd: null, changePct24h: null }));
    const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
    return CRYPTO_IDS.map((c) => ({
      id: c.id,
      label: c.label,
      usd: data[c.id]?.usd ?? null,
      changePct24h: data[c.id]?.usd_24h_change ?? null,
    }));
  } catch {
    return CRYPTO_IDS.map((c) => ({ ...c, usd: null, changePct24h: null }));
  }
}

// Stooq's free CSV quote endpoint (no key) — this is the one piece of the
// Markets card built from documentation recalled rather than a live check,
// since this session can't reach stooq.com to confirm the CSV column order.
// Genuinely needs a look at the deployed card to confirm it parses right.
async function getStooqQuotes(items: { symbol: string; label: string }[]): Promise<QuoteItem[]> {
  const empty = items.map((i) => ({ symbol: i.symbol, label: i.label, price: null }));
  try {
    const symbols = items.map((i) => i.symbol).join(",");
    const res = await fetch(`https://stooq.com/q/l/?s=${symbols}&f=sd2t2c&h&e=csv`);
    if (!res.ok) return empty;
    const text = await res.text();
    const lines = text.trim().split("\n").slice(1);
    const bySymbol = new Map<string, number | null>();
    for (const line of lines) {
      const cols = line.split(",");
      const symbol = cols[0]?.toLowerCase();
      const close = Number(cols[cols.length - 1]);
      if (symbol) bySymbol.set(symbol, Number.isFinite(close) ? close : null);
    }
    return items.map((i) => ({
      symbol: i.symbol,
      label: i.label,
      price: bySymbol.get(i.symbol.toLowerCase()) ?? null,
    }));
  } catch {
    return empty;
  }
}

export async function getMarketsSnapshot(): Promise<MarketsSnapshot> {
  const [currencies, crypto, indices, commodities] = await Promise.all([
    getCurrencies("CAD"),
    getCrypto(),
    getStooqQuotes(INDEX_SYMBOLS),
    getStooqQuotes(COMMODITY_SYMBOLS),
  ]);
  return { base: "CAD", currencies, crypto, indices, commodities, fetchedAt: new Date().toISOString() };
}
