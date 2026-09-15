import CountryFlag from "./country-flag";
import { parsePhoneForDisplay } from "@/lib/phone-display";
import { countryToCode } from "@/lib/country-flag";

export default function PhoneDisplay({ value, country }: { value?: string | null; country?: string | null }) {
  const parsed = parsePhoneForDisplay(value, countryToCode(country));
  if (!parsed) return <>—</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {parsed.country && <CountryFlag country={parsed.country} />}
      {parsed.formatted}
    </span>
  );
}
