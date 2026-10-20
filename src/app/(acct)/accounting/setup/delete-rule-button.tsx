"use client";

import { useTransition } from "react";
import { deleteRule } from "@/actions/accounting";

export default function DeleteRuleButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(() => deleteRule(id))} className="text-xs text-red-600 underline disabled:opacity-50">
      {label}
    </button>
  );
}
