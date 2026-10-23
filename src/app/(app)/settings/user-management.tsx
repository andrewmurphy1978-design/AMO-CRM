"use client";

import { useActionState, useState, useTransition } from "react";
import { createUser, updateUser, deleteUser, resetUserPassword } from "@/actions/users";
import PhoneField from "@/components/phone-field";
import { COUNTRIES } from "@/lib/countries";
import { SECTIONS, type Level, type Permissions } from "@/lib/permissions-shared";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  phone: string | null;
  whatsapp: string | null;
  country: string;
  language: "EN" | "FR";
  perms?: Permissions;
  mailboxAccess?: Record<string, string>;
};

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function UserManagement({
  users,
  currentUserId,
  lang,
  sharedMailboxes = [],
}: {
  sharedMailboxes?: { id: string; name: string; address: string }[];
  users: TeamUser[];
  currentUserId: string;
  lang: Lang;
}) {
  const [selected, setSelected] = useState<TeamUser | null>(null);
  const [mode, setMode] = useState<"none" | "create" | "edit">("none");
  const [country, setCountry] = useState("CA");
  const [tempPassword, setTempPassword] = useState("");
  const [deletePending, startDeleteTransition] = useTransition();
  const [resetPending, startResetTransition] = useTransition();
  const t = getDict(lang);

  const [createState, createAction, createPending] = useActionState(createUser, undefined);
  const [updateState, updateAction, updatePending] = useActionState(updateUser, undefined);

  function openCreate() {
    setSelected(null);
    setRoleDraft("MEMBER");
    setMode("create");
    setCountry("CA");
    setTempPassword("");
  }

  function openEdit(user: TeamUser) {
    setSelected(user);
    setRoleDraft(user.role);
    setMode("edit");
    setCountry(user.country);
    setTempPassword("");
  }

  function closeForm() {
    setSelected(null);
    setMode("none");
    setTempPassword("");
  }

  function handleDelete() {
    if (!selected) return;
    if (!confirm(t.team.deleteConfirm(selected.name))) return;
    startDeleteTransition(() => deleteUser(selected.id));
    closeForm();
  }

  function handleResetPassword() {
    if (mode === "create") {
      setTempPassword(generateTempPassword());
      return;
    }
    if (!selected) return;
    startResetTransition(async () => {
      const result = await resetUserPassword(selected.id);
      if (result?.password) setTempPassword(result.password);
    });
  }

  const activeState = mode === "create" ? createState : updateState;
  const activePending = mode === "create" ? createPending : updatePending;
  const isSelf = selected?.id === currentUserId;
  const [roleDraft, setRoleDraft] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const isAdminRole = (mode === "edit" ? roleDraft : roleDraft) === "ADMIN";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">{t.settings.teamTitle}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-[#0fa38a] px-3 py-1.5 text-xs font-medium text-[#f4faf6] hover:opacity-90"
          >
            {t.team.add}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!selected || isSelf || deletePending}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-30"
          >
            {t.team.delete}
          </button>
        </div>
      </div>

      <ul className="divide-y divide-card-border rounded-md border border-card-border">
        {users.map((user) => (
          <li key={user.id}>
            <button
              type="button"
              onClick={() => openEdit(user)}
              className={`w-full px-3 py-2 text-left transition-colors ${
                selected?.id === user.id ? "bg-amo-lime/10" : "hover:bg-field-bg"
              }`}
            >
              <p className="text-sm font-medium text-ink">{user.name}</p>
              <p className="text-xs text-soft">
                {user.email} · {user.role === "ADMIN" ? t.team.admin : t.team.member}
              </p>
            </button>
          </li>
        ))}
        {users.length === 0 && <p className="px-3 py-4 text-sm text-soft">{t.team.noMembers}</p>}
      </ul>

      {mode !== "none" && (
        <form
          key={selected?.id ?? "new"}
          action={mode === "create" ? createAction : updateAction}
          className="grid gap-3 border-t border-card-border pt-4 sm:grid-cols-2"
        >
          {mode === "edit" && selected && <input type="hidden" name="userId" value={selected.id} />}

          {/* Line 1: Name, Email */}
          <div>
            <label className={LABEL_CLASS}>{t.team.name}</label>
            <input name="name" required defaultValue={selected?.name} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.team.email}</label>
            <input name="email" type="email" required defaultValue={selected?.email} className={FIELD_CLASS} />
          </div>

          {/* Country — governs how phone/WhatsApp below are formatted. */}
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>{t.team.country}</label>
            <select
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={FIELD_CLASS}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Line 2: Phone, WhatsApp — each has its own flag/calling-code
              picker, seeded from Country above but independently changeable. */}
          <PhoneField name="phone" label={t.team.phoneNumber} defaultCountry={country} defaultValue={selected?.phone} />
          <PhoneField
            name="whatsapp"
            label={t.team.whatsappNumber}
            defaultCountry={country}
            defaultValue={selected?.whatsapp}
          />

          {/* Line 3: Role, Language */}
          <div>
            <label className={LABEL_CLASS}>{t.team.role}</label>
            <select
              name="role"
              value={roleDraft}
              onChange={(e) => setRoleDraft(e.target.value as "ADMIN" | "MEMBER")}
              disabled={isSelf}
              className={`${FIELD_CLASS} disabled:opacity-60`}
            >
              <option value="MEMBER">{t.team.member}</option>
              <option value="ADMIN">{t.team.admin}</option>
            </select>
          </div>
          <AccessMatrix key={selected?.id ?? "new"} initial={selected?.perms} lang={lang} disabled={isAdminRole} />
          {!isAdminRole && sharedMailboxes.length > 0 && <MailboxAccess key={`mb-${selected?.id ?? "new"}`} boxes={sharedMailboxes} initial={selected?.mailboxAccess} lang={lang} />}
          <div>
            <label className={LABEL_CLASS}>{t.team.language}</label>
            <div className="mt-2 flex items-center gap-4 text-sm text-ink">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="language"
                  value="EN"
                  defaultChecked={(selected?.language ?? "EN") === "EN"}
                  className="accent-amo-lime"
                />
                {t.team.english}
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="language"
                  value="FR"
                  defaultChecked={selected?.language === "FR"}
                  className="accent-amo-lime"
                />
                {t.team.french}
              </label>
            </div>
          </div>

          {/* Line 4: Temporary password + Reset Password */}
          <div className="sm:col-span-2 flex items-end gap-2">
            <div className="flex-1">
              <label className={LABEL_CLASS}>{t.team.temporaryPassword}</label>
              <input
                name="password"
                type="text"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                placeholder={t.team.tempPasswordPlaceholder}
                className={FIELD_CLASS}
              />
            </div>
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={resetPending}
              className="rounded-md border border-card-border px-3 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
            >
              {resetPending ? t.team.resetting : t.team.resetPassword}
            </button>
          </div>

          <div className="sm:col-span-2 flex items-center gap-3">
            {activeState?.error && <p className="text-sm text-red-600">{activeState.error}</p>}
            {activeState?.success && <p className="text-sm text-emerald-700">{activeState.success}</p>}
          </div>

          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={activePending}
              className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
            >
              {activePending ? t.team.saving : t.team.save}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
            >
              {t.team.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const LABELS: Record<string, [string, string]> = {
  dashboard: ["Dashboard", "Tableau de bord"], email: ["Email", "Courriel"], sms: ["SMS", "SMS"], calendar: ["Calendar", "Calendrier"],
  tasks: ["Tasks", "Tâches"], contacts: ["Contacts", "Contacts"], projects: ["Projects", "Projets"], invoices: ["Invoices", "Factures"],
  accounting: ["Accounting", "Comptabilité"], marketing: ["Marketing", "Marketing"], socialAnalytics: ["Social media", "Médias sociaux"],
  bookings: ["Bookings", "Réservations"], settings: ["Settings", "Paramètres"],
};
const LEVEL_OPTS: { v: Level; en: string; fr: string }[] = [
  { v: "NONE", en: "No access", fr: "Aucun accès" },
  { v: "READ", en: "Read only", fr: "Lecture seule" },
  { v: "WRITE", en: "Read & write", fr: "Lecture et écriture" },
  { v: "DELETE", en: "Read, write & delete", fr: "Lecture, écriture et suppression" },
];

// Access per section, with one-click presets. Saved as a JSON map in a hidden field.
function AccessMatrix({ initial, lang, disabled }: { initial?: Permissions; lang: Lang; disabled: boolean }) {
  const fr = lang === "fr";
  const full = (l: Level) => Object.fromEntries(SECTIONS.map((s) => [s.key, l])) as Permissions;
  const [perms, setPerms] = useState<Permissions>(initial ?? full("DELETE"));
  const presets: { label: string; value: Permissions }[] = [
    { label: fr ? "Accès complet" : "Full access", value: { ...full("DELETE") } },
    { label: fr ? "Lecture seule" : "Read only", value: { ...full("READ"), settings: "WRITE" } },
    { label: fr ? "Comptabilité seulement" : "Accounting only", value: { ...full("NONE"), accounting: "DELETE", settings: "WRITE" } },
  ];
  return (
    <div className="sm:col-span-2 rounded-md border border-card-border bg-field-bg/40 p-3">
      <input type="hidden" name="permissions" value={JSON.stringify(perms)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={LABEL_CLASS}>{fr ? "Accès par section" : "Access by section"}</span>
        {!disabled && (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button key={p.label} type="button" onClick={() => setPerms(p.value)} className="rounded-md border border-card-border px-2 py-1 text-xs text-ink hover:bg-black/5">
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {disabled ? (
        <p className="mt-2 text-xs text-soft">{fr ? "Les administrateurs ont toujours un accès complet." : "Admins always have full access."}</p>
      ) : (
        <>
          <div className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <label key={s.key} className="flex items-center justify-between gap-2 text-sm text-ink">
                <span>{LABELS[s.key][fr ? 1 : 0]}</span>
                <select
                  value={perms[s.key]}
                  onChange={(e) => setPerms({ ...perms, [s.key]: e.target.value as Level })}
                  className="rounded-md border border-card-border bg-field-bg px-2 py-1 text-xs text-ink"
                >
                  {LEVEL_OPTS.map((o) => (
                    <option key={o.v} value={o.v}>{fr ? o.fr : o.en}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-soft">
            {fr
              ? "Comptabilité donne à la personne ses propres livres, séparés des vôtres. Chacun garde l'accès à ses Paramètres personnels."
              : "Accounting gives the person their own books, separate from yours. Everyone keeps access to their own Settings."}
          </p>
        </>
      )}
    </div>
  );
}

const MB_OPTS = [
  { v: "NONE", en: "No access", fr: "Aucun accès" },
  { v: "READ", en: "Read only", fr: "Lecture seule" },
  { v: "SEND", en: "Read & send", fr: "Lecture et envoi" },
  { v: "COMPLETE", en: "Read, send & complete", fr: "Lecture, envoi et complétion" },
];

// Access to each shared mailbox (support@, finance@…). There is no delete level.
function MailboxAccess({ boxes, initial, lang }: { boxes: { id: string; name: string; address: string }[]; initial?: Record<string, string>; lang: Lang }) {
  const fr = lang === "fr";
  const [value, setValue] = useState<Record<string, string>>(initial ?? {});
  return (
    <div className="sm:col-span-2 rounded-md border border-card-border bg-field-bg/40 p-3">
      <input type="hidden" name="mailboxAccess" value={JSON.stringify(value)} />
      <span className={LABEL_CLASS}>{fr ? "Boîtes courriel partagées" : "Shared mailboxes"}</span>
      <div className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {boxes.map((b) => (
          <label key={b.id} className="flex items-center justify-between gap-2 text-sm text-ink">
            <span>{b.name} <span className="text-xs text-soft">{b.address}</span></span>
            <select value={value[b.id] ?? "NONE"} onChange={(e) => setValue({ ...value, [b.id]: e.target.value })} className="rounded-md border border-card-border bg-field-bg px-2 py-1 text-xs text-ink">
              {MB_OPTS.map((o) => <option key={o.v} value={o.v}>{fr ? o.fr : o.en}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-soft">{fr ? "Aucune suppression de courriel n'est permise." : "Deleting messages is never allowed."}</p>
    </div>
  );
}
