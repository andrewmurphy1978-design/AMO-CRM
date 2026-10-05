"use client";

import { useActionState } from "react";
import { saveStripeSettings } from "@/actions/integrations";
import type { Lang } from "@/lib/i18n/dictionaries";

const FIELD = "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-soft";

export default function StripeForm({ connected, webhookSet, webhookUrl, lang }: { connected: boolean; webhookSet: boolean; webhookUrl: string; lang: Lang }) {
  const [state, action, pending] = useActionState(saveStripeSettings, undefined);
  const fr = lang === "fr";
  return (
    <div className="space-y-3">
      <p className="text-sm text-soft">
        {fr ? "Statut :" : "Status:"}{" "}
        {connected ? <span className="font-medium text-emerald-700">{webhookSet ? (fr ? "Connecté (paiements automatiques)" : "Connected (payments are recorded automatically)") : fr ? "Clé enregistrée — il manque le secret du webhook" : "Key saved — the webhook secret is still missing"}</span> : <span className="font-medium text-soft">{fr ? "Non connecté" : "Not connected"}</span>}
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-xs text-soft">
        <li>{fr ? "Dans Stripe : Développeurs → Clés API → copiez la clé secrète (sk_live_… ou sk_test_… pour essayer)." : "In Stripe: Developers → API keys → copy the secret key (sk_live_… , or sk_test_… to try it out)."}</li>
        <li>
          {fr ? "Développeurs → Webhooks → Ajouter un point de terminaison à cette adresse : " : "Developers → Webhooks → Add an endpoint at this address: "}
          <code className="rounded bg-black/5 px-1 py-0.5 text-ink">{webhookUrl}</code>
          {fr ? " avec les événements checkout.session.completed et checkout.session.async_payment_succeeded." : " with the events checkout.session.completed and checkout.session.async_payment_succeeded."}
        </li>
        <li>{fr ? "Copiez le « secret de signature » (whsec_…) du webhook et collez-le ci-dessous." : "Copy the webhook's “signing secret” (whsec_…) and paste it below."}</li>
      </ol>
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL}>{fr ? "Clé secrète Stripe" : "Stripe secret key"}</label>
          <input name="secretKey" type="password" placeholder={connected ? "••••••••  (leave empty to keep)" : "sk_live_…"} className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label className={LABEL}>{fr ? "Secret de signature du webhook" : "Webhook signing secret"}</label>
          <input name="webhookSecret" type="password" placeholder={webhookSet ? "••••••••  (leave empty to keep)" : "whsec_…"} className={FIELD} autoComplete="off" />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60">
            {pending ? (fr ? "Enregistrement…" : "Saving…") : fr ? "Enregistrer" : "Save"}
          </button>
        </div>
      </form>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}
    </div>
  );
}
