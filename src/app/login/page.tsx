import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LoginForm from "./login-form";

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

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="amo-bg-image" />
      <div className="amo-bg-overlay" />

      <div className="relative z-10 w-full max-w-sm rounded-3xl border border-amo-border bg-amo-card p-8 shadow-2xl">
        <div className="mb-6 h-[3px] w-full rounded-full amo-card-accent" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={AMO_LOGO_URL} alt="Andrew Murphy Online" className="mx-auto h-16 w-16" />
        <h1 className="mt-4 text-center font-display text-xl font-semibold text-amo-white">
          Andrew Murphy Online
        </h1>
        <p className="mt-1 text-center text-sm text-amo-muted">Sign in to your CRM</p>
        <LoginForm callbackUrl={callbackUrl ?? "/"} />
      </div>
    </div>
  );
}
