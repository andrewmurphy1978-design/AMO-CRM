"use client";

import { useState, useTransition } from "react";
import { triggerBufferSync } from "@/actions/buffer";
import RefreshButton from "./refresh-button";

export default function SocialSyncButton({ label, loadingLabel }: { label: string; loadingLabel: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; success?: string } | null>(null);

  return (
    <div className="shrink-0 text-right">
      <RefreshButton
        onClick={() =>
          startTransition(async () => {
            setResult(await triggerBufferSync());
          })
        }
        loading={pending}
        label={label}
        loadingLabel={loadingLabel}
      />
      {result?.error && <p className="mt-1 max-w-[220px] text-right text-xs text-red-600">{result.error}</p>}
      {result?.success && <p className="mt-1 text-right text-xs text-emerald-700">{result.success}</p>}
    </div>
  );
}
