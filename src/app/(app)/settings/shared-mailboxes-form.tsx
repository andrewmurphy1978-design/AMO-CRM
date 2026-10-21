"use client";

import { useActionState, useState } from "react";
import { saveSharedMailboxAction, testSharedMailboxAction, deleteSharedMailboxAction } from "@/actions/shared-mailboxes";
import { MAILBOX_PRESETS } from "@/lib/mail/shared-levels";
import MailboxMembers from "./mailbox-members";
import type { Lang } from "@/lib/i18n/dictionaries";

export type SharedMailboxRow = {
  id: string;
  name: string;
  address: string;
  displayName: string | null;
  provider: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: string;
  username: string;
  googleConnected: boolean;
  lastError: string | null;
};

const FIELD = "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-soft";

function Editor({ box, fr, onDone }: { box?: SharedMailboxRow; fr: boolean; onDone?: () => void }) {
  const [saveState, saveAction, savePending] = useActionState(saveSharedMailboxAction, undefined);
  const [testState, testAction, testPending] = useActionState(testSharedMailboxAction, undefined);
  const [preset, setPreset] = useState(box?.provider ?? "google-oauth");
  const isGoogle = preset === "google-oauth";
  const p = MAILBOX_PRESETS.find((x) => x.provider === preset) ?? MAILBOX_PRESETS[3];
  const [hosts, setHosts] = useState({
    imapHost: box?.imapHost ?? p.imapHost, imapPort: box?.imapPort ?? p.imapPort,
    smtpHost: box?.smtpHost ?? p.smtpHost, smtpPort: box?.smtpPort ?? p.smtpPort,
  });
  function choose(v: string) {
    setPreset(v);
    const q = MAILBOX_PRESETS.find((x) => x.provider === v);
    if (q) setHosts({ imapHost: q.imapHost, imapPort: q.imapPort, smtpHost: q.smtpHost, smtpPort: q.smtpPort });
  }
  return (
    <form action={saveAction} className="space-y-3">
      {box && <input type="hidden" name="id" value={box.id} />}
      <input type="hidden" name="provider" value={preset} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={LABEL}>{fr ? "Nom (ex. Soutien, Finance)" : "Name (e.g. Support, Finance)"}</label>
          <input name="name" required defaultValue={box?.name} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>{fr ? "Adresse courriel" : "Email address"}</label>
          <input name="address" type="email" required defaultValue={box?.address} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>{fr ? "Nom affiché à l'envoi" : "Display name when sending"}</label>
          <input name="displayName" defaultValue={box?.displayName ?? ""} className={FIELD} />
        </div>
      </div>
      <div>
        <label className={LABEL}>{fr ? "Fournisseur" : "Provider"}</label>
        <select value={preset} onChange={(e) => choose(e.target.value)} className={FIELD}>
          <option value="google-oauth">{fr ? "Google Workspace / Gmail : se connecter avec Google (recommandé)" : "Google Workspace / Gmail: sign in with Google (recommended)"}</option>
          {MAILBOX_PRESETS.map((x) => <option key={x.provider} value={x.provider}>{x.label}</option>)}
        </select>
        {(preset === "google" || preset === "microsoft") && (
          <p className="mt-1 text-xs text-soft">
            {fr
              ? "Utilisez un mot de passe d'application (Google : compte avec la vérification en 2 étapes, IMAP activé par l'administrateur Workspace). Le mot de passe habituel ne fonctionne pas."
              : "Use an app password (Google: the account needs 2-step verification and IMAP enabled by the Workspace admin). The normal password will not work."}
          </p>
        )}
      </div>
      {isGoogle ? (
        <div className="space-y-2 rounded-md border border-card-border bg-field-bg/40 p-3 text-sm text-ink">
          <p className="text-xs text-soft">
            {fr
              ? "Enregistrez d'abord, puis cliquez sur « Connecter avec Google » et choisissez le compte Google de cette boîte (ex. support@votreentreprise.com). Aucun mot de passe n'est conservé."
              : "Save first, then click “Connect with Google” and pick this mailbox's own Google account (e.g. support@yourcompany.com). No password is stored."}
          </p>
          {(box?.googleConnected && !saveState?.id) && <p className="text-xs font-medium text-emerald-700">{fr ? "Connecté à Google." : "Connected to Google."}</p>}
          {(box?.id || saveState?.id) && (
            <a href={`/api/google/shared/connect?mailboxId=${box?.id ?? saveState?.id}`} className="inline-block rounded-md bg-[#0fa38a] px-3 py-1.5 text-xs font-medium text-[#f4faf6] hover:opacity-90">
              {box?.googleConnected ? (fr ? "Reconnecter avec Google" : "Reconnect with Google") : fr ? "Connecter avec Google" : "Connect with Google"}
            </a>
          )}
        </div>
      ) : (<>
      <div className="grid gap-3 sm:grid-cols-4">
        <div><label className={LABEL}>IMAP</label><input name="imapHost" value={hosts.imapHost} onChange={(e) => setHosts({ ...hosts, imapHost: e.target.value })} className={FIELD} /></div>
        <div><label className={LABEL}>{fr ? "Port IMAP" : "IMAP port"}</label><input name="imapPort" type="number" value={hosts.imapPort} onChange={(e) => setHosts({ ...hosts, imapPort: Number(e.target.value) })} className={FIELD} /></div>
        <div><label className={LABEL}>{fr ? "Sécurité" : "Security"}</label>
          <select name="imapSecurity" defaultValue={box?.imapSecurity ?? "tls"} className={FIELD}><option value="tls">TLS</option><option value="starttls">STARTTLS</option><option value="plain">{fr ? "Aucune" : "None"}</option></select></div>
        <div className="hidden sm:block" />
        <div><label className={LABEL}>SMTP</label><input name="smtpHost" value={hosts.smtpHost} onChange={(e) => setHosts({ ...hosts, smtpHost: e.target.value })} className={FIELD} /></div>
        <div><label className={LABEL}>{fr ? "Port SMTP" : "SMTP port"}</label><input name="smtpPort" type="number" value={hosts.smtpPort} onChange={(e) => setHosts({ ...hosts, smtpPort: Number(e.target.value) })} className={FIELD} /></div>
        <div><label className={LABEL}>{fr ? "Sécurité" : "Security"}</label>
          <select name="smtpSecurity" defaultValue={box?.smtpSecurity ?? (hosts.smtpPort === 587 ? "starttls" : "tls")} className={FIELD}><option value="tls">TLS</option><option value="starttls">STARTTLS</option><option value="plain">{fr ? "Aucune" : "None"}</option></select></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={LABEL}>{fr ? "Nom d'utilisateur (par défaut : l'adresse)" : "Username (defaults to the address)"}</label><input name="username" defaultValue={box?.username ?? ""} className={FIELD} /></div>
        <div><label className={LABEL}>{fr ? "Mot de passe / mot de passe d'application" : "Password / app password"}</label><input name="password" type="password" placeholder={box ? (fr ? "Laisser vide pour le conserver" : "Leave blank to keep") : ""} className={FIELD} /></div>
      </div>
      </>)}
      {box?.lastError && <p className="text-xs text-red-600">{box.lastError}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={savePending} className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60">{savePending ? "…" : fr ? "Enregistrer" : "Save"}</button>
        {!isGoogle && <button type="submit" formAction={testAction} disabled={testPending} className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60">{testPending ? "…" : fr ? "Tester la connexion" : "Test connection"}</button>}
        {box && (
          <button type="button" onClick={() => { if (confirm(fr ? "Retirer cette boîte partagée ?" : "Remove this shared mailbox?")) void deleteSharedMailboxAction(box.id).then(onDone); }} className="rounded-md border border-card-border px-4 py-2 text-sm text-red-600 hover:bg-black/5">{fr ? "Retirer" : "Remove"}</button>
        )}
      </div>
      {saveState?.error && <p className="text-sm text-red-600">{saveState.error}</p>}
      {saveState?.success && <p className="text-sm text-emerald-700">{saveState.success}</p>}
      {testState?.error && <p className="text-sm text-red-600">{testState.error}</p>}
      {testState?.success && <p className="text-sm text-emerald-700">{testState.success}</p>}
    </form>
  );
}

export default function SharedMailboxesForm({ mailboxes, lang, members, access }: { mailboxes: SharedMailboxRow[]; lang: Lang; members: { id: string; name: string }[]; access: Record<string, Record<string, string>> }) {
  const fr = lang === "fr";
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-soft">
        {fr
          ? "Boîtes partagées (soutien, finance, ventes…) en IMAP/SMTP : Google Workspace, Microsoft 365, IONOS ou tout autre fournisseur. Donnez ensuite l'accès à chaque membre dans Accès de l'équipe."
          : "Shared mailboxes (support, finance, sales…) over IMAP/SMTP: Google Workspace, Microsoft 365, IONOS or any other provider. Then grant each team member access under Team access."}
      </p>
      {mailboxes.map((m) => (
        <details key={m.id} className="rounded-md border border-card-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-ink">{m.name} · <span className="text-soft">{m.address}</span></summary>
          <div className="mt-3 space-y-4"><Editor box={m} fr={fr} /><div className="border-t border-card-border pt-3"><MailboxMembers mailboxId={m.id} members={members} initial={access[m.id] ?? {}} fr={fr} /></div></div>
        </details>
      ))}
      {adding ? (
        <div className="rounded-md border border-card-border p-3">
          <Editor fr={fr} onDone={() => setAdding(false)} />
          <button type="button" onClick={() => setAdding(false)} className="mt-2 text-xs text-soft underline">{fr ? "Fermer" : "Close"}</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="rounded-md bg-[#0fa38a] px-3 py-1.5 text-xs font-medium text-[#f4faf6] hover:opacity-90">+ {fr ? "Ajouter une boîte partagée" : "Add a shared mailbox"}</button>
      )}
    </div>
  );
}
