"use client";

import { createContext, useContext, type ReactNode } from "react";

// The signed-in user's language, available to any client component (the date fields use it to write
// "October 10, 2026" or "10 octobre 2026").
const LangContext = createContext<"en" | "fr">("en");

export function LangProvider({ lang, children }: { lang: "en" | "fr"; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
