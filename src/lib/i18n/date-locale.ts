import { fr } from "date-fns/locale";
import type { Lang } from "./dictionaries";

// date-fns defaults to English with no locale passed, so only French needs
// an explicit locale object here.
export function getDateLocale(lang: Lang) {
  return lang === "fr" ? fr : undefined;
}
