import { getRecentEmails } from "@/lib/google";
import EmailCard, { type EmailLabels } from "./email-card";

// `accessToken` is resolved once, sequentially, by the caller — see the
// comment on getRecentEmails in src/lib/google.ts for why this can't fetch
// it itself.
export default async function EmailCardServer({
  accessToken,
  labels,
}: {
  accessToken: string | null;
  labels: EmailLabels;
}) {
  const emails = accessToken ? await getRecentEmails(accessToken) : null;
  return <EmailCard initial={emails} connected={accessToken !== null} labels={labels} />;
}
