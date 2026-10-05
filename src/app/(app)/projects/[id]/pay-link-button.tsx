"use client";

import { useState } from "react";
import { getInvoicePayLink } from "@/actions/pay";

// Copies the invoice's online payment link (Stripe) so it can be pasted into a message.
export default function PayLinkButton({ invoiceId, lang }: { invoiceId: string; lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-card-border pt-3">
      <button
        type="button"
        onClick={async () => {
          const res = await getInvoicePayLink(invoiceId, window.location.origin);
          if (!res.link) return setMsg(res.error ?? "—");
          try {
            await navigator.clipboard.writeText(res.link);
            setMsg(fr ? "Lien de paiement copié." : "Payment link copied.");
          } catch {
            setMsg(res.link);
          }
        }}
        className="rounded-md border border-card-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5"
      >
        {fr ? "🔗 Copier le lien de paiement" : "🔗 Copy the payment link"}
      </button>
      {msg && <span className="break-all text-xs text-soft">{msg}</span>}
    </div>
  );
}
