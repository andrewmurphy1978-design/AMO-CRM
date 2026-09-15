import type { ComponentType, SVGProps } from "react";
import * as Flags from "country-flag-icons/react/3x2";
import { countryToCode } from "@/lib/country-flag";

// Real vector flags (bundled SVGs, no external network needed) rather than
// Unicode flag emoji, which render inconsistently (as plain two-letter text
// on Windows) and can't be styled.
export default function CountryFlag({
  country,
  className,
}: {
  country?: string | null;
  className?: string;
}) {
  const code = countryToCode(country);
  if (!code) return null;
  const Flag = (Flags as unknown as Record<string, ComponentType<SVGProps<SVGSVGElement>>>)[code];
  if (!Flag) return null;
  return <Flag className={className ?? "inline-block h-3.5 w-5 shrink-0 rounded-[2px] align-middle"} />;
}
