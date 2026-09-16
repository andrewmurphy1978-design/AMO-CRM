"use client";

import clsx from "@/lib/clsx";

export default function RefreshButton({
  onClick,
  loading,
  label,
  loadingLabel,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-soft transition-colors hover:bg-black/5 hover:text-ink disabled:opacity-60"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        className={clsx("h-3.5 w-3.5", loading && "animate-spin")}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
      {loading ? loadingLabel : label}
    </button>
  );
}
