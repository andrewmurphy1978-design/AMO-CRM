"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createPendingFolders, loadRootHandle } from "@/lib/local-folder-handle";

// Creates the client / project folders on this computer. Once the folder was connected in Settings
// the browser keeps working in the background; when it has to ask for permission again (the browser
// forgets it between sessions) a small banner offers a one-click button.
export default function LocalFolderSync({ lang }: { lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const pathname = usePathname();
  const [waiting, setWaiting] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const check = useCallback(async (askPermission: boolean) => {
    const root = await loadRootHandle();
    if (!root) return;
    const res = await fetch("/api/local-folders", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const { items } = (await res.json()) as { items: unknown[] };
    if (items.length === 0) {
      setWaiting(0);
      return;
    }
    let perm = await root.queryPermission({ mode: "readwrite" });
    if (perm !== "granted" && askPermission) perm = await root.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      setWaiting(items.length);
      return;
    }
    const r = await createPendingFolders(root);
    setWaiting(0);
    if (r.created > 0) setMessage(fr ? `${r.created} dossier(s) créé(s) sur cet ordinateur.` : `${r.created} folder(s) created on this computer.`);
    if (r.failed > 0) setMessage(fr ? `${r.failed} dossier(s) n'ont pas pu être créés.` : `${r.failed} folder(s) could not be created.`);
  }, [fr]);

  useEffect(() => {
    let live = true;
    void Promise.resolve().then(async () => { if (live) await check(false); });
    return () => {
      live = false;
    };
  }, [pathname, check]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(t);
  }, [message]);

  if (waiting === 0 && !message) return null;
  return (
    <div className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-card-border bg-card-bg px-4 py-2 text-sm text-ink shadow-lg">
      {message ?? (
        <>
          📁 {fr ? `${waiting} dossier(s) à créer sur cet ordinateur.` : `${waiting} folder(s) to create on this computer.`}{" "}
          <button type="button" onClick={() => void check(true)} className="ml-2 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
            {fr ? "Créer les dossiers" : "Create the folders"}
          </button>
        </>
      )}
    </div>
  );
}
