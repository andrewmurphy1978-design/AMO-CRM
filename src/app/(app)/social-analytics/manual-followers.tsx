"use client";

import { useState, useTransition } from "react";
import { saveManualFollowersAction } from "@/actions/social-posts";

export interface ManualFollowersRow {
  platform: "x" | "tiktok" | "youtube";
  name: string;
  en: number | null;
  fr: number | null;
}

// For the platforms no automation can read (X, TikTok, YouTube): type today's follower count and it is stored like any
// other daily snapshot, so it feeds the same charts and totals.
export default function ManualFollowers({ rows, lang }: { rows: ManualFollowersRow[]; lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.flatMap((r) => [[`${r.platform}:EN`, r.en?.toString() ?? ""], [`${r.platform}:FR`, r.fr?.toString() ?? ""]])),
  );
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const entries = Object.entries(values)
      .filter(([, v]) => v.trim() !== "")
      .map(([k, v]) => {
        const [platform, language] = k.split(":");
        return { platform, language, followers: Number(v.replace(/[\s,]/g, "")) };
      });
    setMessage(null);
    start(async () => {
      const result = await saveManualFollowersAction(entries);
      setMessage(result.ok ? (fr ? `${result.saved} compteur(s) enregistré(s).` : `${result.saved} count(s) saved.`) : result.error);
    });
  }

  return (
    <form onSubmit={submit} className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <h2 className="font-display text-lg font-semibold text-ink">{fr ? "Abonnés saisis à la main" : "Followers entered by hand"}</h2>
      <p className="mt-1 text-sm text-soft">
        {fr
          ? "Pour X, TikTok et YouTube, qu'aucune automatisation ne peut lire : entrez le nombre d'abonnés du jour. Il est gardé comme les autres relevés quotidiens."
          : "For X, TikTok and YouTube, which no automation can read: enter today's follower count. It is kept like any other daily snapshot."}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.platform} className="rounded-lg border border-card-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">{r.name}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["EN", "FR"] as const).map((language) => (
                <label key={language} className="text-xs text-soft">
                  {language}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={values[`${r.platform}:${language}`] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [`${r.platform}:${language}`]: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-card-border bg-card-bg px-2 py-1.5 text-sm text-ink"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60">
          {pending ? (fr ? "Enregistrement…" : "Saving…") : fr ? "Enregistrer" : "Save"}
        </button>
        {message && <span className="text-sm text-soft">{message}</span>}
      </div>
    </form>
  );
}
