export interface InstalmentDraft {
  label: string;
  percentage: number;
  amount: null;
  dueDate: null;
}

// "50% / 40% / 10%" (a contact's payment schedule) -> instalment rows. Falls back
// to the usual 50 / 40 / 10 when the contact has none or it doesn't add up to 100.
export function defaultInstalments(schedule: string | null | undefined, lang: "en" | "fr"): InstalmentDraft[] {
  const parsed = (schedule ?? "")
    .split(/[/,;+|]|\s-\s/)
    .map((p) => Number.parseFloat(p.replace(",", ".").replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  const total = parsed.reduce((a, b) => a + b, 0);
  const pcts = parsed.length >= 1 && Math.abs(total - 100) < 0.01 ? parsed : [50, 40, 10];
  const fr = lang === "fr";
  return pcts.map((percentage, i) => {
    const last = i === pcts.length - 1;
    const label =
      pcts.length === 1
        ? fr ? "Paiement complet — à l'acceptation" : "Full payment — on acceptance"
        : i === 0
          ? fr ? "Dépôt — à l'acceptation" : "Deposit — on acceptance"
          : last
            ? fr ? "Au lancement" : "At launch"
            : pcts.length === 3
              ? fr ? "À l'approbation de la maquette" : "On mock-up approval"
              : fr ? `Étape ${i}` : `Milestone ${i}`;
    return { label, percentage, amount: null, dueDate: null };
  });
}
