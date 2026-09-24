import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LoginForm from "./login-form";
import { dictionaries } from "@/lib/i18n/dictionaries";

const AMO_LOGO_URL =
  "https://d1yei2z3i6k35z.cloudfront.net/18410699/6a596ef4e08523.10636812_AMOBadgeTransparentwithAMOonly.png";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session) {
    redirect("/");
  }

  const { callbackUrl } = await searchParams;

  // min-h-dvh, not min-h-screen — see app-shell.tsx's own comment on why
  // 100vh is unreliable on mobile.
  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4">
      <div className="amo-bg-image amo-bg-image--login" />
      <div className="amo-bg-overlay" />

      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl bg-[#1e4430] p-8 shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={AMO_LOGO_URL} alt="Andrew Murphy Online" className="h-auto w-full" />
        <p className="mt-2 text-center text-sm text-amo-muted">{dictionaries.en.login.subtitle}</p>
        <LoginForm callbackUrl={callbackUrl ?? "/"} />
      </div>
    </div>
  );
}
