"use client";

// Opens the browser's print dialog: choose "Save as PDF" as the destination to get a PDF of the report.
export default function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg border border-card-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5">
      {label}
    </button>
  );
}
