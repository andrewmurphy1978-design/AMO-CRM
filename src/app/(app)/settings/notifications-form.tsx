"use client";

import { useCallback, useEffect, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { PUSH_CATEGORIES, type PushCategory } from "@/lib/push-categories";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function keyBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

// Install-as-app and push notifications for this device (Android, iPhone home-screen app, Windows).
export default function NotificationsForm({ lang }: { lang: Lang }) {
  const t = getDict(lang).settings;
  const [supported, setSupported] = useState(true);
  const [iosBrowser, setIosBrowser] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [thisDevice, setThisDevice] = useState(false);
  const [devices, setDevices] = useState(0);
  const [disabled, setDisabled] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIosBrowser(/iPad|iPhone|iPod/.test(navigator.userAgent) && !standalone);
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    let endpoint = "";
    try {
      const reg = await navigator.serviceWorker.ready;
      endpoint = (await reg.pushManager.getSubscription())?.endpoint ?? "";
    } catch {
      /* no service worker yet */
    }
    const res = await fetch(`/api/push/preferences?endpoint=${encodeURIComponent(endpoint)}`).catch(() => null);
    if (res?.ok) {
      const j = (await res.json()) as { disabled: string[]; devices: number; thisDevice: boolean; admin: boolean };
      setDisabled(j.disabled);
      setDevices(j.devices);
      setThisDevice(j.thisDevice);
      setIsAdmin(j.admin);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => {
      clearTimeout(first);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") return;
      const { publicKey } = (await (await fetch("/api/push/key")).json()) as { publicKey: string };
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
      await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setMessage(t.pushSave);
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function test() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang }) });
      const j = (await res.json()) as { ok: boolean };
      setMessage(j.ok ? t.pushTestSent : t.pushTestNone);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(category: PushCategory) {
    const next = disabled.includes(category) ? disabled.filter((c) => c !== category) : [...disabled, category];
    setDisabled(next);
    await fetch("/api/push/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ disabled: next }) });
  }

  const labels: Record<PushCategory, string> = {
    email: t.pushCatEmail,
    calendar: t.pushCatCalendar,
    contact: t.pushCatContact,
    sms: t.pushCatSms,
    social: t.pushCatSocial,
    invoice: t.pushCatInvoice,
  };
  const adminOnly: PushCategory[] = ["contact", "sms", "social", "invoice"];
  const on = thisDevice && permission === "granted";
  const btn = "rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60";

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          {installed ? (
            <p className="text-sm text-emerald-700">{t.pushInstalled}</p>
          ) : (
            installEvent && (
              <button type="button" className={`btn-primary ${btn}`} onClick={() => void installEvent.prompt()}>
                {t.pushInstall}
              </button>
            )
          )}
        </div>
        {!installed && <p className="mt-2 text-xs text-soft">{t.pushInstallHelp}</p>}
      </div>

      <div className="border-t border-card-border pt-4">
        {!supported || iosBrowser ? (
          <p className="text-sm text-soft">{iosBrowser ? t.pushIos : t.pushUnsupported}</p>
        ) : (
          <>
            <p className="text-sm text-ink">{permission === "denied" ? t.pushDenied : on ? t.pushOn : t.pushOff}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {on ? (
                <>
                  <button type="button" disabled={busy} className={`btn-primary ${btn}`} onClick={() => void test()}>
                    {t.pushTest}
                  </button>
                  <button type="button" disabled={busy} className={`rounded-lg border border-card-border bg-white ${btn} text-ink`} onClick={() => void disable()}>
                    {t.pushDisable}
                  </button>
                </>
              ) : (
                permission !== "denied" && (
                  <button type="button" disabled={busy} className={`btn-primary ${btn}`} onClick={() => void enable()}>
                    {t.pushEnable}
                  </button>
                )
              )}
              {devices > 0 && (
                <span className="text-xs text-soft">
                  {t.pushDevices} {devices}
                </span>
              )}
            </div>
            {message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}
          </>
        )}
      </div>

      <div className="border-t border-card-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-soft">{t.pushWhat}</p>
        <div className="mt-2 space-y-2">
          {PUSH_CATEGORIES.filter((c) => isAdmin || !adminOnly.includes(c)).map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={!disabled.includes(c)} onChange={() => void toggle(c)} />
              {labels[c]}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
