"use client";

import { useRouter } from "next/navigation";

// Status dropdown that applies itself on change — no Filter button.
export default function StatusFilter({
  status,
  view,
  allLabel,
  options,
}: {
  status: string;
  view: "cards" | "table";
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();

  function change(next: string) {
    const params = new URLSearchParams();
    if (next) params.set("status", next);
    if (view !== "cards") params.set("view", view);
    const qs = params.toString();
    router.push(qs ? `/projects?${qs}` : "/projects");
  }

  return (
    <select
      value={status}
      onChange={(e) => change(e.target.value)}
      className="rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
