"use client";

import { useTransition } from "react";
import { deleteManualEntry } from "@/actions/accounting";

export default function DeleteEntryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => confirm("Delete?") && start(() => deleteManualEntry(id))} className="text-xs text-red-600">
      ✕
    </button>
  );
}
