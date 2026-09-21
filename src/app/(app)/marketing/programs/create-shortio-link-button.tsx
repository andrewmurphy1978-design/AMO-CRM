"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAffiliateShortLink } from "@/actions/affiliate-programs";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function CreateShortIoLinkButton({
  programId,
  variant,
  lang,
}: {
  programId: string;
  variant: "default" | "fr";
  lang: Lang;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const t = getDict(lang);

  return (
    <div className="mt-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await createAffiliateShortLink(programId, variant);
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
        className="text-xs font-semibold text-amo-lime hover:underline disabled:opacity-60"
      >
        {pending ? t.marketing.shortioCreating : t.marketing.shortioCreateLink}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
