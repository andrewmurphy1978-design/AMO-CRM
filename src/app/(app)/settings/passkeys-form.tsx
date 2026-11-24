"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { deletePasskey, listMyPasskeys, type PasskeyItem } from "@/actions/passkeys";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import FingerprintIcon from "@/components/fingerprint-icon";

const noSubscribe = () => () => {};

function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "Mac";
  return "Device";
}

// Settings → Biometric sign-in: set up a passkey on this device (Face ID / fingerprint / Windows Hello), and remove
// the ones set up on other devices.
export default function PasskeysForm({ lang }: { lang: Lang }) {
  const t = getDict(lang).passkeys;
  const locale = lang === "fr" ? "fr-CA" : "en-CA";
  const supported = useSyncExternalStore(noSubscribe, () => typeof window.PublicKeyCredential !== "undefined", () => true);
  const [items, setItems] = useState<PasskeyItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = useCallback(() => listMyPasskeys().then(setItems), []);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function setUp() {
    setBusy(true);
    setMessage(null);
    try {
      const optionsJSON = await fetch("/api/passkey/register/options", { method: "POST" }).then((r) => r.json());
      const response = await startRegistration({ optionsJSON });
      const res = await fetch("/api/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, deviceName: guessDeviceName() }),
      });
      setMessage(res.ok ? { ok: true, text: t.done } : { ok: false, text: t.error });
      await reload();
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === "InvalidStateError") setMessage({ ok: false, text: t.alreadySetUp });
      else if (name !== "NotAllowedError" && name !== "AbortError") setMessage({ ok: false, text: t.error });
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: PasskeyItem) {
    if (!window.confirm(t.confirmRemove.replace("{device}", item.deviceName))) return;
    await deletePasskey(item.id);
    await reload();
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale, { dateStyle: "medium" });

  return (
    <div className="space-y-4">
      <p className="text-sm text-soft">{t.explain}</p>
      {supported ? (
        <button type="button" onClick={setUp} disabled={busy} className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60">
          <FingerprintIcon />
          {busy ? t.settingUp : t.setUp}
        </button>
      ) : (
        <p className="text-sm text-amber-700">{t.unsupported}</p>
      )}
      {message && <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}

      <div className="border-t border-card-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">{t.devices}</h3>
        {items === null ? null : items.length === 0 ? (
          <p className="mt-2 text-sm text-soft">{t.empty}</p>
        ) : (
          <ul className="mt-2 divide-y divide-card-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{item.deviceName}</p>
                  <p className="text-xs text-soft">
                    {t.added} {fmt(item.createdAt)} · {t.lastUsed} {item.lastUsedAt ? fmt(item.lastUsedAt) : t.never}
                  </p>
                </div>
                <button type="button" onClick={() => remove(item)} className="shrink-0 text-xs font-medium text-red-600 hover:underline">
                  {t.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
