import type { PrismaClient } from "@/lib/prisma";

export type Currency = "CAD" | "USD" | "EUR" | "GBP";

// Rates are always cached relative to CAD (Andrew's home currency) —
// 1 CAD = rates[currency] units of that currency.
export type ExchangeRates = Record<Exclude<Currency, "CAD">, number>;

const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

// frankfurter.app mirrors the European Central Bank's daily reference
// rates — free, no API key, no rate limit worth worrying about for a
// handful of refreshes a day. If it's ever unreachable, the caller falls
// back to whatever was last cached (even if stale) rather than blocking a
// proposal/invoice from being created.
async function fetchLatestRates(): Promise<ExchangeRates> {
  const res = await fetch("https://api.frankfurter.app/latest?from=CAD&to=USD,EUR,GBP");
  if (!res.ok) throw new Error(`Exchange rate API returned ${res.status}`);
  const json = (await res.json()) as { rates: Record<string, number> };
  const { USD, EUR, GBP } = json.rates;
  if (typeof USD !== "number" || typeof EUR !== "number" || typeof GBP !== "number") {
    throw new Error("Exchange rate API response missing expected currencies");
  }
  return { USD, EUR, GBP };
}

// Cache-aware — only calls the external API when nothing is cached yet or
// the cache is older than STALE_AFTER_MS, so a page that needs a
// conversion (e.g. a Proposal total) never pays for a live fetch on every
// request.
export async function getExchangeRates(db: PrismaClient): Promise<ExchangeRates> {
  const cached = await db.exchangeRateCache.findUnique({ where: { id: "singleton" } });
  const isStale = !cached || Date.now() - cached.fetchedAt.getTime() > STALE_AFTER_MS;

  if (!isStale) {
    return cached.rates as unknown as ExchangeRates;
  }

  try {
    const rates = await fetchLatestRates();
    await db.exchangeRateCache.upsert({
      where: { id: "singleton" },
      update: { rates },
      create: { id: "singleton", rates },
    });
    return rates;
  } catch {
    // A stale cache is still far better than blocking the page — only
    // rethrow when there's nothing at all to fall back on.
    if (cached) return cached.rates as unknown as ExchangeRates;
    throw new Error("Unable to fetch exchange rates and no cached rates are available");
  }
}

// Converts an amount already expressed in `currency` into CAD — the common
// unit Proposal/Invoice totals are compared/reported in internally.
export function toCad(amount: number, currency: Currency, rates: ExchangeRates): number {
  if (currency === "CAD") return amount;
  return amount / rates[currency];
}

// Converts a CAD amount into `currency` — used when a Proposal/Invoice is
// issued in a currency other than CAD.
export function fromCad(amountCad: number, currency: Currency, rates: ExchangeRates): number {
  if (currency === "CAD") return amountCad;
  return amountCad * rates[currency];
}
