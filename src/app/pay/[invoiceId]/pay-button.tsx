"use client";

import { useState } from "react";
import { startCheckout } from "@/actions/pay";

export default function PayButton({ invoiceId, exp, sig, label, fr }: { invoiceId: string; exp: string; sig: string; label: string; fr: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await startCheckout(invoiceId, exp, sig, window.location.origin);
          if (res.url) window.location.href = res.url;
          else {
            setBusy(false);
            setError(res.error ?? (fr ? "Le paiement n'a pas pu démarrer." : "Couldn't start the payment."));
          }
        }}
        className="w-full rounded-lg bg-[#0f2a1d] px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-[#143826] disabled:opacity-60"
      >
        {busy ? (fr ? "Redirection vers le paiement sécurisé…" : "Redirecting to secure payment…") : label}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
