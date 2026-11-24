"use client";

import { useState, useSyncExternalStore } from "react";
import { signIn } from "next-auth/react";
import { startAuthentication } from "@simplewebauthn/browser";
import FingerprintIcon from "@/components/fingerprint-icon";

const noSubscribe = () => () => {};

// Uses next-auth/react's client-side signIn() (a plain fetch() from the
// browser) rather than a Server Action calling the server-side signIn().
// Both work, but this keeps the sign-in request/response entirely inside
// normal browser fetch + navigation, with no dependency on how a given
// hosting platform's server-action redirect handling behaves.
export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const passkeysSupported = useSyncExternalStore(noSubscribe, () => typeof window.PublicKeyCredential !== "undefined", () => false);

  // Face ID / fingerprint / Windows Hello — see src/lib/passkey.ts. A passkey set up on a phone can also sign in on
  // a PC (the browser offers a QR code to scan with the phone).
  async function signInWithPasskey() {
    setError(null);
    setPending(true);
    try {
      const optionsJSON = await fetch("/api/passkey/login/options", { method: "POST" }).then((r) => r.json());
      const response = await startAuthentication({ optionsJSON });
      const result = await signIn("passkey", { response: JSON.stringify(response), redirect: false });
      if (result?.error) {
        setError("This device isn't set up for biometric sign-in. Sign in with your password, then set it up in Settings → Biometric sign-in.");
        setPending(false);
        return;
      }
      window.location.href = callbackUrl;
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name !== "NotAllowedError" && name !== "AbortError") setError("Biometric sign-in didn't work. Please try again or use your password.");
      setPending(false);
    }
  }

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setPending(true);
        const formData = new FormData(e.currentTarget);
        try {
          const result = await signIn("credentials", {
            email: formData.get("email"),
            password: formData.get("password"),
            redirect: false,
          });
          if (result?.error) {
            setError("Invalid email or password.");
            setPending(false);
            return;
          }
          window.location.href = callbackUrl;
        } catch {
          setError("Something went wrong. Please try again.");
          setPending(false);
        }
      }}
    >
      <div>
        <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-amo-muted">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1.5 w-full rounded-lg border border-card-border bg-field-bg px-4 py-3 text-sm text-ink shadow-sm transition-colors focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-amo-muted">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1.5 w-full rounded-lg border border-card-border bg-field-bg px-4 py-3 text-sm text-ink shadow-sm transition-colors focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full btn-primary rounded-xl px-4 py-3 text-sm font-semibold shadow-sm disabled:opacity-60 disabled:hover:scale-100"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
      {passkeysSupported && (
        <>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-amo-muted">
            <span className="h-px flex-1 bg-white/15" />
            or
            <span className="h-px flex-1 bg-white/15" />
          </div>
          <button
            type="button"
            onClick={signInWithPasskey}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 px-4 py-3 text-sm font-semibold text-amo-white transition-colors hover:bg-white/10 disabled:opacity-60"
          >
            <FingerprintIcon className="h-5 w-5" />
            Sign in with Face ID, fingerprint or Windows Hello
          </button>
        </>
      )}
    </form>
  );
}
