"use client";

import { useEffect, useState } from "react";

// Shows the message passed back from deleteContact's redirect (see its own
// comment for why the message has to travel this way instead of client
// state) — same 5s-then-gone shape as the Edit form's save toast. Strips
// the `deleted` param from the URL via the History API (not
// router.replace, which would need a Suspense boundary here just for
// useSearchParams) once shown, so a refresh or a Back nav to this exact
// URL doesn't re-show a stale toast.
export default function DeleteToast({ message }: { message: string | undefined }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!message) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("deleted");
    window.history.replaceState(null, "", url.pathname + (url.search || ""));
    const timer = setTimeout(() => setDismissed(true), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message || dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg">{message}</div>
    </div>
  );
}
