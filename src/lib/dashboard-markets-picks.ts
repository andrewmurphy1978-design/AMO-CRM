import type { PrismaClient } from "@/lib/prisma";

// Defaults + helpers for the customizable Dashboard header Markets widget:
// each user picks 1 currency (shown as "1 CAD = x <currency>") and up to 3
// other items (indices/commodities/crypto), each identified by a
// "index:<symbol>" / "commodity:<symbol>" / "crypto:<id>" key. Both are
// stored as plain strings/arrays on User (null/empty meaning "use these
// defaults", not the defaults baked in) so a future change to the defaults
// still reaches anyone who never customized their own — same reasoning as
// src/lib/world-clock-zones.ts.
//
// The labels below are duplicated from src/lib/markets.ts's own symbol
// tables (INDEX_SYMBOLS/COMMODITY_SYMBOLS/CRYPTO_IDS) rather than imported
// from it, so this file — used by the Settings form Client Component — never
// pulls that module's server-only fetch functions into the client bundle.
// Keep the two lists in sync if either changes.
export const MAX_MARKET_ITEMS = 3;

export const MARKET_CURRENCY_OPTIONS = ["USD", "EUR", "GBP"] as const;
export type MarketCurrencyOption = (typeof MARKET_CURRENCY_OPTIONS)[number];

export const DEFAULT_MARKET_CURRENCY: MarketCurrencyOption = "USD";

export type MarketItemGroup = "index" | "commodity" | "crypto";

export interface MarketItemOption {
  key: string; // "<group>:<symbolOrId>"
  group: MarketItemGroup;
  label: string;
}

export const MARKET_ITEM_OPTIONS: MarketItemOption[] = [
  { key: "index:^GSPC", group: "index", label: "S&P 500" },
  { key: "index:^DJI", group: "index", label: "Dow Jones" },
  { key: "index:^IXIC", group: "index", label: "Nasdaq" },
  { key: "index:^GSPTSE", group: "index", label: "TSX" },
  { key: "index:^FTSE", group: "index", label: "FTSE 100" },
  { key: "index:^GDAXI", group: "index", label: "DAX" },
  { key: "index:^FCHI", group: "index", label: "CAC 40" },
  { key: "index:^N225", group: "index", label: "Nikkei 225" },
  { key: "index:^HSI", group: "index", label: "Hang Seng" },
  { key: "commodity:GC=F", group: "commodity", label: "Gold" },
  { key: "commodity:BZ=F", group: "commodity", label: "Brent crude" },
  { key: "commodity:CL=F", group: "commodity", label: "WTI crude" },
  { key: "crypto:bitcoin", group: "crypto", label: "Bitcoin" },
  { key: "crypto:ethereum", group: "crypto", label: "Ethereum" },
];

export const DEFAULT_MARKET_ITEMS = ["index:^GSPC", "commodity:GC=F", "crypto:bitcoin"];

export function effectiveMarketCurrency(stored: string | null): MarketCurrencyOption {
  if (stored && (MARKET_CURRENCY_OPTIONS as readonly string[]).includes(stored)) {
    return stored as MarketCurrencyOption;
  }
  return DEFAULT_MARKET_CURRENCY;
}

export function effectiveMarketItems(stored: string[]): string[] {
  const valid = stored.filter((key) => MARKET_ITEM_OPTIONS.some((o) => o.key === key)).slice(0, MAX_MARKET_ITEMS);
  return valid.length > 0 ? valid : [...DEFAULT_MARKET_ITEMS];
}

// Reads the signed-in user's own Markets picks fresh from the DB — same
// "session is only reissued at login" reasoning as getUserWorldClockZones.
export async function getUserMarketsPicks(
  session: { user: { id: string } } | null,
  db: PrismaClient,
): Promise<{ currency: MarketCurrencyOption; items: string[] }> {
  if (!session) {
    return { currency: DEFAULT_MARKET_CURRENCY, items: [...DEFAULT_MARKET_ITEMS] };
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { marketsCurrency: true, marketsItems: true },
  });
  return {
    currency: effectiveMarketCurrency(user?.marketsCurrency ?? null),
    items: effectiveMarketItems(user?.marketsItems ?? []),
  };
}
