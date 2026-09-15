"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

// Uses next-auth/react's client-side signIn() (a plain fetch() from the
// browser) rather than a Server Action calling the server-side signIn().
// Both work, but this keeps the sign-in request/response entirely inside
// normal browser fetch + navigation, with no dependency on how a given
// hosting platform's server-action redirect handling behaves.
export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
        <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-soft">
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
        <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-soft">
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
    </form>
  );
}
