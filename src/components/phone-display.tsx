import CountryFlag from "./country-flag";
import { parsePhoneForDisplay } from "@/lib/phone-display";
import { countryToCode } from "@/lib/country-flag";

export default function PhoneDisplay({
  value,
  country,
  showFlag = true,
}: {
  value?: string | null;
  country?: string | null;
  // Off for the Contacts mobile card, which already shows the contact's
  // country as a single flag next to their name — repeating it here (this
  // flag reflects the phone number's own calling code, which can differ
  // from the contact's stored country) would just be visual noise.
  showFlag?: boolean;
}) {
  const parsed = parsePhoneForDisplay(value, countryToCode(country));
  if (!parsed) return <>—</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {showFlag && parsed.country && <CountryFlag country={parsed.country} />}
      {parsed.formatted}
    </span>
  );
}
