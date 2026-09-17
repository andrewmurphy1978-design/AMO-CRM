import { withScopedPrismaClient } from "@/lib/prisma";
import { getCachedInbox, getScreeningExtras, type EmailScreeningPayload } from "@/lib/email-inbox";
import EmailCard, { type EmailLabels } from "./email-card";

// Reads the same cached inbox snapshot the Email page maintains (see
// EmailInboxCache) rather than fetching Gmail live — this card and the
// Email page share one screening/classification cache, so neither ever
// re-spends a Claude call the other has already paid for. `userId` is
// resolved once, sequentially, by the caller — see the comment on
// getRecentEmails in src/lib/google.ts for why this can't fetch it
// itself.
export default async function EmailCardServer({
  accessToken,
  userId,
  hour12,
  lang,
  labels,
}: {
  accessToken: string | null;
  userId: string;
  hour12: boolean;
  lang: "en" | "fr";
  labels: EmailLabels;
}) {
  const initialData: EmailScreeningPayload | null = accessToken
    ? await withScopedPrismaClient(async (db) => {
        const snapshot = await getCachedInbox(db, userId);
        if (!snapshot) return null;
        const extras = await getScreeningExtras(db, snapshot);
        return { ...snapshot, ...extras };
      })
    : null;

  return <EmailCard initialData={initialData} connected={accessToken !== null} hour12={hour12} lang={lang} labels={labels} />;
}
