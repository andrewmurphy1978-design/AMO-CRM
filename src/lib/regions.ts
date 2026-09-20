import { countryToCode } from "./country-flag";
import { normalizeProvinceCode } from "./canadian-tax";

export interface RegionOption {
  code: string;
  name: string;
}

// Canada: 10 provinces + 3 territories.
export const CA_PROVINCES: RegionOption[] = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

// United States: 50 states + DC + the main territories.
export const US_STATES: RegionOption[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
  { code: "PR", name: "Puerto Rico" },
  { code: "GU", name: "Guam" },
  { code: "VI", name: "U.S. Virgin Islands" },
  { code: "AS", name: "American Samoa" },
  { code: "MP", name: "Northern Mariana Islands" },
];

// France: the 18 régions (13 metropolitan + 5 overseas), ISO 3166-2:FR codes.
export const FR_REGIONS: RegionOption[] = [
  { code: "ARA", name: "Auvergne-Rhône-Alpes" },
  { code: "BFC", name: "Bourgogne-Franche-Comté" },
  { code: "BRE", name: "Bretagne" },
  { code: "CVL", name: "Centre-Val de Loire" },
  { code: "COR", name: "Corse" },
  { code: "GES", name: "Grand Est" },
  { code: "HDF", name: "Hauts-de-France" },
  { code: "IDF", name: "Île-de-France" },
  { code: "NOR", name: "Normandie" },
  { code: "NAQ", name: "Nouvelle-Aquitaine" },
  { code: "OCC", name: "Occitanie" },
  { code: "PDL", name: "Pays de la Loire" },
  { code: "PAC", name: "Provence-Alpes-Côte d'Azur" },
  { code: "GP", name: "Guadeloupe" },
  { code: "MQ", name: "Martinique" },
  { code: "GF", name: "Guyane" },
  { code: "RE", name: "La Réunion" },
  { code: "YT", name: "Mayotte" },
];

// United Kingdom: its 4 constituent countries — the closest analog to a
// "province/state" (UK addresses don't otherwise use a state-level field).
export const GB_REGIONS: RegionOption[] = [
  { code: "ENG", name: "England" },
  { code: "SCT", name: "Scotland" },
  { code: "WLS", name: "Wales" },
  { code: "NIR", name: "Northern Ireland" },
];

// Belgium: its 10 provinces + the Brussels-Capital Region, ISO 3166-2:BE codes.
export const BE_PROVINCES: RegionOption[] = [
  { code: "VAN", name: "Antwerp" },
  { code: "VBR", name: "Flemish Brabant" },
  { code: "VOV", name: "East Flanders" },
  { code: "VWV", name: "West Flanders" },
  { code: "VLI", name: "Limburg" },
  { code: "WBR", name: "Walloon Brabant" },
  { code: "WHT", name: "Hainaut" },
  { code: "WLG", name: "Liège" },
  { code: "WLX", name: "Luxembourg" },
  { code: "WNA", name: "Namur" },
  { code: "BRU", name: "Brussels-Capital Region" },
];

// Switzerland: its 26 cantons, using their traditional 2-letter abbreviations.
export const CH_CANTONS: RegionOption[] = [
  { code: "AG", name: "Aargau" },
  { code: "AI", name: "Appenzell Innerrhoden" },
  { code: "AR", name: "Appenzell Ausserrhoden" },
  { code: "BE", name: "Bern" },
  { code: "BL", name: "Basel-Landschaft" },
  { code: "BS", name: "Basel-Stadt" },
  { code: "FR", name: "Fribourg" },
  { code: "GE", name: "Geneva" },
  { code: "GL", name: "Glarus" },
  { code: "GR", name: "Graubünden" },
  { code: "JU", name: "Jura" },
  { code: "LU", name: "Lucerne" },
  { code: "NE", name: "Neuchâtel" },
  { code: "NW", name: "Nidwalden" },
  { code: "OW", name: "Obwalden" },
  { code: "SG", name: "St. Gallen" },
  { code: "SH", name: "Schaffhausen" },
  { code: "SO", name: "Solothurn" },
  { code: "SZ", name: "Schwyz" },
  { code: "TG", name: "Thurgau" },
  { code: "TI", name: "Ticino" },
  { code: "UR", name: "Uri" },
  { code: "VD", name: "Vaud" },
  { code: "VS", name: "Valais" },
  { code: "ZG", name: "Zug" },
  { code: "ZH", name: "Zürich" },
];

// Australia: its 6 states + 2 territories, using their everyday abbreviations
// (not all 2 letters — e.g. NSW, VIC — since those are what's actually used).
export const AU_STATES: RegionOption[] = [
  { code: "NSW", name: "New South Wales" },
  { code: "VIC", name: "Victoria" },
  { code: "QLD", name: "Queensland" },
  { code: "WA", name: "Western Australia" },
  { code: "SA", name: "South Australia" },
  { code: "TAS", name: "Tasmania" },
  { code: "ACT", name: "Australian Capital Territory" },
  { code: "NT", name: "Northern Territory" },
];

// New Zealand: its 16 regions, ISO 3166-2:NZ codes.
export const NZ_REGIONS: RegionOption[] = [
  { code: "AUK", name: "Auckland" },
  { code: "BOP", name: "Bay of Plenty" },
  { code: "CAN", name: "Canterbury" },
  { code: "GIS", name: "Gisborne" },
  { code: "HKB", name: "Hawke's Bay" },
  { code: "MWT", name: "Manawatū-Whanganui" },
  { code: "MBH", name: "Marlborough" },
  { code: "NSN", name: "Nelson" },
  { code: "NTL", name: "Northland" },
  { code: "OTA", name: "Otago" },
  { code: "STL", name: "Southland" },
  { code: "TKI", name: "Taranaki" },
  { code: "TAS", name: "Tasman" },
  { code: "WKO", name: "Waikato" },
  { code: "WGN", name: "Wellington" },
  { code: "WTC", name: "West Coast" },
];

const REGIONS_BY_COUNTRY_CODE: Record<string, RegionOption[]> = {
  CA: CA_PROVINCES,
  US: US_STATES,
  FR: FR_REGIONS,
  GB: GB_REGIONS,
  BE: BE_PROVINCES,
  CH: CH_CANTONS,
  AU: AU_STATES,
  NZ: NZ_REGIONS,
};

// Returns the region list for a country (free-text name or ISO code alike —
// same resolver the phone/flag fields use), or null when that country has
// no region list of its own — the state/province field then stays free text.
export function regionOptionsForCountry(countryNameOrCode?: string | null): RegionOption[] | null {
  const code = countryToCode(countryNameOrCode);
  if (!code) return null;
  return REGIONS_BY_COUNTRY_CODE[code] ?? null;
}

function foldAccents(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Resolves whatever's stored/typed (a full name in English or French, or
// already a code) to that country's canonical region code. Returns the
// input unchanged when the country has no region list (free text) or when
// nothing matches — never silently discards a value someone typed.
export function normalizeRegionForCountry(countryNameOrCode: string | null | undefined, rawRegion: string | null | undefined): string {
  const trimmed = (rawRegion ?? "").trim();
  if (!trimmed) return "";

  const options = regionOptionsForCountry(countryNameOrCode);
  if (!options) return trimmed;

  const byCode = options.find((o) => o.code.toLowerCase() === trimmed.toLowerCase());
  if (byCode) return byCode.code;

  const folded = foldAccents(trimmed);
  const byName = options.find((o) => foldAccents(o.name) === folded);
  if (byName) return byName.code;

  // Canada has a richer French-name alias table already maintained for tax
  // jurisdiction lookups (e.g. "Colombie-Britannique") — reuse it here too
  // rather than duplicating it.
  if (countryToCode(countryNameOrCode) === "CA") {
    const alias = normalizeProvinceCode(trimmed);
    if (alias) return alias;
  }

  return trimmed;
}
