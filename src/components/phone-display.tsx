import CountryFlag from "./country-flag";
import { parsePhoneForDisplay } from "@/lib/phone-display";

export default function PhoneDisplay({ value }: { value?: string | null }) {
  const parsed = parsePhoneForDisplay(value);
  if (!parsed) return <>—</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {parsed.country && <CountryFlag country={parsed.country} />}
      {parsed.formatted}
    </span>
  );
}
