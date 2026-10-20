"use client";

import { useState, useTransition } from "react";
import { unlockReconciliation } from "@/actions/accounting";

export default function UnlockButton({ id, label, confirmText }: { id: string; label: string; confirmText: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2 text-xs">
      {error && <span className="text-red-600">{error}</span>}
      <button disabled={pending} className="text-red-600 underline disabled:opacity-50" onClick={() => confirm(confirmText) && start(async () => setError((await unlockReconciliation(id)).error ?? null))}>
        {label}
      </button>
    </span>
  );
}
