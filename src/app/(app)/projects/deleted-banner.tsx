"use client";

import { useEffect, useState } from "react";

// "Deleted" confirmation after a project is removed (?deleted=1); it fades away and cleans the URL.
export default function DeletedBanner({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    try {
      window.history.replaceState(null, "", "/projects");
    } catch {
      /* ignore */
    }
    const timer = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div role="status" className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
      {message}
    </div>
  );
}
