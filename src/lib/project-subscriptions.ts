import type { FieldTpl, FieldValues, TemplateConfig } from "@/lib/project-templates";

// Field keys of the built-in templates that name an app / service the client
// pays for (a template field can also be flagged `app` in the customization page).
const APP_KEYS = new Set(["app", "esp", "tool", "crm", "provider", "registrar", "apps"]);

export function isAppField(f: FieldTpl): boolean {
  return f.app ?? APP_KEYS.has(f.key);
}

export interface SubscriptionDraft {
  name: string;
  amount: number;
  period: string;
  note: string;
}

// The apps chosen in the Project details, as subscription rows to fill in.
// The domain registrar is a yearly fee; everything else defaults to monthly.
export function appSubscriptionsFrom(template: TemplateConfig, values: FieldValues): SubscriptionDraft[] {
  const out: SubscriptionDraft[] = [];
  const seen = new Set<string>();
  for (const f of template.fields) {
    if (f.type === "spacer" || !isAppField(f)) continue;
    const v = values[f.key];
    const names = (Array.isArray(v) ? v : v ? [v] : []).map((x) => x.trim()).filter((x) => x && x !== "Y" && x !== "N");
    for (const name of names) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, amount: 0, period: f.key === "registrar" ? "year" : "month", note: f.key === "registrar" ? "Domain name" : "" });
    }
  }
  return out;
}
