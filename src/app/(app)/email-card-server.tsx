import { getRecentEmails, type EmailSummary } from "@/lib/google";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getEmailClassifications, type EmailCategory } from "@/lib/email-classifier";
import { getReadStates } from "@/lib/email-inbox";
import EmailCard, { type EmailLabels } from "./email-card";

// `accessToken` is resolved once, sequentially, by the caller — see the
// comment on getRecentEmails in src/lib/google.ts for why this can't fetch
// it itself.
export default async function EmailCardServer({
  accessToken,
  hour12,
  lang,
  labels,
}: {
  accessToken: string | null;
  hour12: boolean;
  lang: "en" | "fr";
  labels: EmailLabels;
}) {
  const emails = accessToken ? await getRecentEmails(accessToken) : null;

  let unread: EmailSummary[] | null = emails;
  let classifications: Record<string, EmailCategory> = {};
  if (emails) {
    ({ unread, classifications } = await withScopedPrismaClient(async (db) => {
      const readStates = await getReadStates(
        db,
        emails.map((e) => e.id)
      );
      const unread = emails.filter((e) => !readStates[e.id]);
      const classifications = await getEmailClassifications(db, unread);
      return { unread, classifications };
    }));
  }

  return (
    <EmailCard
      initial={unread}
      initialClassifications={classifications}
      connected={accessToken !== null}
      hour12={hour12}
      lang={lang}
      labels={labels}
    />
  );
}
