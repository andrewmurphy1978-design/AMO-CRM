// Flagcdn.com — free, no key, documented pattern: https://flagcdn.com/{width}/{iso2}.png.
// Covers every ISO country code plus a couple of common supranational ones
// ("eu" for the European Union) that this dashboard also needs.
export function countryFlagUrl(iso2: string, width = 40): string {
  return `https://flagcdn.com/w${width}/${iso2.toLowerCase()}.png`;
}

// Québec isn't a country, so it has no ISO code and isn't on flagcdn.
// Wikimedia Commons' Special:FilePath is the standard way to hotlink a
// Commons file by name without needing its content-hashed upload URL.
export const QUEBEC_FLAG_URL = "https://commons.wikimedia.org/wiki/Special:FilePath/Flag_of_Quebec.svg";
