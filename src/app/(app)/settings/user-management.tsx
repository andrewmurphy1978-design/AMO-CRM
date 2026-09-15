"use client";

import { useActionState, useState, useTransition } from "react";
import { createUser, updateUser, deleteUser, resetUserPassword } from "@/actions/users";
import PhoneField from "./phone-input";
import { COUNTRIES } from "@/lib/countries";
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
}: {
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
    setMode("create");
    setCountry("CA");
    setTempPassword("");
  }

  function openEdit(user: TeamUser) {
    setSelected(user);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">{t.settings.teamTitle}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
          >
            {t.team.add}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!selected || isSelf || deletePending}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-30"
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
              defaultValue={selected?.role ?? "MEMBER"}
              disabled={isSelf}
              className={`${FIELD_CLASS} disabled:opacity-60`}
            >
              <option value="MEMBER">{t.team.member}</option>
              <option value="ADMIN">{t.team.admin}</option>
            </select>
          </div>
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
