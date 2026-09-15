import { prisma } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";

export default async function MarketingPage() {
  const lang = await getLang();
  const t = getDict(lang);

  const [campaigns, automations] = await Promise.all([
    prisma.emailCampaign.findMany({ orderBy: { systemeIoId: "desc" } }),
    prisma.automationWorkflow.findMany({ orderBy: { systemeIoId: "desc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t.marketing.title}</h1>
        <p className="mt-1 text-sm text-soft">{t.marketing.subtitle}</p>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-lg font-semibold text-ink">{t.marketing.campaignsTitle}</h2>
        {campaigns.length === 0 ? (
          <p className="mt-2 text-sm text-soft">{t.marketing.noCampaignsYet}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-card-border text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wide text-soft">
                <tr>
                  <th className="py-2 pr-4">{t.marketing.colSubject}</th>
                  <th className="py-2 pr-4">{t.marketing.colStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-4 font-medium text-ink">{c.subject ?? c.name ?? "—"}</td>
                    <td className="py-2 pr-4 text-ink/70">
                      {c.status === "sent" ? t.marketing.statusSent : c.status === "draft" ? t.marketing.statusDraft : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-lg font-semibold text-ink">{t.marketing.automationsTitle}</h2>
        {automations.length === 0 ? (
          <p className="mt-2 text-sm text-soft">{t.marketing.noAutomationsYet}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-card-border text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wide text-soft">
                <tr>
                  <th className="py-2 pr-4">{t.marketing.colName}</th>
                  <th className="py-2 pr-4">{t.marketing.colStatus}</th>
                  <th className="py-2 pr-4">{t.marketing.colTrigger}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {automations.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-4 font-medium text-ink">{a.name ?? "—"}</td>
                    <td className="py-2 pr-4 text-ink/70">
                      {a.status === "active" ? t.marketing.statusActive : a.status === "inactive" ? t.marketing.statusInactive : "—"}
                    </td>
                    <td className="py-2 pr-4 text-ink/70">
                      {a.triggerType ? (t.marketing.triggerTypes[a.triggerType as keyof typeof t.marketing.triggerTypes] ?? a.triggerType) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
