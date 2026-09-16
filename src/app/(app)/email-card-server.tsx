import { getGoogleConnection, getRecentEmails } from "@/lib/google";
import EmailCard, { type EmailLabels } from "./email-card";

export default async function EmailCardServer({ labels }: { labels: EmailLabels }) {
  const connection = await getGoogleConnection();
  const emails = connection ? await getRecentEmails() : null;
  return <EmailCard initial={emails} connected={!!connection} labels={labels} />;
}
