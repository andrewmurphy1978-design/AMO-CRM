"use client";

import { useTransition } from "react";
import { deleteImportBatch } from "@/actions/accounting";

export default function DeleteBatchButton({ id, label, confirmText }: { id: string; label: string; confirmText: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => confirm(confirmText) && start(() => deleteImportBatch(id))} className="text-xs text-red-600 underline disabled:opacity-50">
      {pending ? "…" : label}
    </button>
  );
}
