"use client";

import { useActionState, useEffect, useState } from "react";
import { saveLocalFilesRoot } from "@/actions/local-folders";
import { createPendingFolders, folderPickerSupported, loadRootHandle, pickRootHandle } from "@/lib/local-folder-handle";
import type { Lang } from "@/lib/i18n/dictionaries";

const FIELD = "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-soft";

export default function LocalFilesForm({ root, lang }: { root: string | null; lang: Lang }) {
  const fr = lang === "fr";
  const [state, action, pending] = useActionState(saveLocalFilesRoot, undefined);
  const [connected, setConnected] = useState<string | null>(null); // the connected folder's name
  const [supported, setSupported] = useState(true);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    void loadRootHandle().then((h) => {
      setSupported(folderPickerSupported());
      setConnected(h?.name ?? null);
    });
  }, []);

  async function connect() {
    setInfo(null);
    const handle = await pickRootHandle();
    if (!handle) return;
    setConnected(handle.name);
    const r = await createPendingFolders(handle);
    setInfo(fr ? `Dossier relié. ${r.created} dossier(s) créé(s)${r.failed ? `, ${r.failed} en échec` : ""}.` : `Folder connected. ${r.created} folder(s) created${r.failed ? `, ${r.failed} failed` : ""}.`);
  }

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-2">
        <div>
          <label className={LABEL}>{fr ? "Dossier des fichiers locaux" : "Local files folder"}</label>
          <input name="root" defaultValue={root ?? ""} placeholder="C:\Users\Andrew\Clients" className={FIELD} />
          <p className="mt-1 text-xs text-soft">
            {fr
              ? "Le chemin complet du dossier où vos fichiers clients sont rangés. Chaque contact reçoit un sous-dossier, et chaque projet un sous-dossier dans celui de son client."
              : "The full path of the folder where your client files are kept. Every contact gets a sub-folder, and every project a sub-folder inside its client's."}
          </p>
        </div>
        <button type="submit" disabled={pending} className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60">
          {pending ? (fr ? "Enregistrement…" : "Saving…") : fr ? "Enregistrer" : "Save"}
        </button>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}
      </form>

      <div className="rounded-lg border border-card-border bg-field-bg p-3">
        <p className={LABEL}>{fr ? "Créer les dossiers sur cet ordinateur" : "Create the folders on this computer"}</p>
        <p className="mt-1 text-xs text-soft">
          {fr
            ? "Le CRM est en ligne : il enregistre les chemins, et c'est votre navigateur (Chrome ou Edge) qui crée les dossiers. Cliquez ci-dessous et choisissez ce même dossier, une seule fois ; ensuite les nouveaux dossiers se créent tout seuls quand le CRM est ouvert (le navigateur peut redemander la permission à chaque session)."
            : "The CRM is online: it saves the paths, and your browser (Chrome or Edge) creates the folders. Click below and pick that same folder, once; after that new folders are created by themselves while the CRM is open (the browser may ask for permission again each session)."}
        </p>
        {supported ? (
          <button type="button" onClick={() => void connect()} className="mt-2 rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5">
            📁 {connected ? (fr ? `Changer le dossier relié (${connected})` : `Change the connected folder (${connected})`) : fr ? "Relier le dossier de cet ordinateur" : "Connect this computer's folder"}
          </button>
        ) : (
          <p className="mt-2 text-xs text-red-600">{fr ? "Ce navigateur ne permet pas de créer des dossiers : utilisez Chrome ou Edge." : "This browser can't create folders: use Chrome or Edge."}</p>
        )}
        {info && <p className="mt-2 text-xs text-emerald-700">{info}</p>}
      </div>
    </div>
  );
}
