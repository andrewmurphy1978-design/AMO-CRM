import { format, differenceInYears } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { Lang } from "@/lib/i18n/dictionaries";

// Contact.birthday is stored as text, in one of two shapes depending on
// where it came from: "YYYY-MM-DD" (a full date, from Google Contacts or
// typed by hand) or "--MM-DD" (Google's own "no year known" shape, common
// for a personal contact). Only the first shape lets us compute an age.
interface ParsedBirthday {
  date: Date;
  hasYear: boolean;
}

export function parseBirthday(raw: string | null | undefined): ParsedBirthday | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const fullMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (fullMatch) {
    const [, y, m, d] = fullMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (Number.isNaN(date.getTime())) return null;
    return { date, hasYear: true };
  }
  const noYearMatch = trimmed.match(/^--(\d{2})-(\d{2})$/);
  if (noYearMatch) {
    const [, m, d] = noYearMatch;
    // Any fixed reference year works here — only month/day are ever read
    // off this date since hasYear is false.
    const date = new Date(2000, Number(m) - 1, Number(d));
    if (Number.isNaN(date.getTime())) return null;
    return { date, hasYear: false };
  }
  return null;
}

// "September 29, 2026" / "29 septembre 2026", or just "September 29" /
// "29 septembre" when Google gave us no year — plus, when a year is known,
// the age computed as of today.
export function formatBirthday(raw: string | null | undefined, lang: Lang): { display: string; age: number | null } | null {
  const parsed = parseBirthday(raw);
  if (!parsed) return null;
  const locale = getDateLocale(lang);
  const pattern = lang === "fr" ? (parsed.hasYear ? "d MMMM yyyy" : "d MMMM") : parsed.hasYear ? "MMMM d, yyyy" : "MMMM d";
  const display = format(parsed.date, pattern, { locale });
  const age = parsed.hasYear ? differenceInYears(new Date(), parsed.date) : null;
  return { display, age };
}
