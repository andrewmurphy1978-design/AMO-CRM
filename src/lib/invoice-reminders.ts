// Andrew's Gmail connection is read-only (see src/lib/google.ts) — there's
// no scope wired up to send mail from the CRM itself. Rather than pretend
// to "auto-send" something the app can't actually do, a reminder is always
// a drafted email Andrew reviews and sends himself via a prefilled mailto:
// link; Contact.autoSendInvoiceReminders only changes how prominently it's
// flagged (a client set to "automatic" surfaces the draft front-and-center
// as ready to go, one set to "manual" is just listed for review).
const REMINDER_INTERVAL_DAYS = 7;

export interface ReminderDraft {
  subject: string;
  body: string;
  mailtoHref: string;
}

export function buildReminderDraft(
  invoice: { number: string | null; totalAmount: number; currency: string; dueDate: Date | null },
  contact: { email: string; firstName: string | null }
): ReminderDraft {
  const label = invoice.number ? `#${invoice.number}` : "your invoice";
  const dueText = invoice.dueDate ? invoice.dueDate.toLocaleDateString() : "recently";
  const subject = `Friendly reminder: invoice ${label} — ${invoice.totalAmount.toFixed(2)} ${invoice.currency}`;
  const body = `Hi ${contact.firstName ?? "there"},

Just a friendly reminder that invoice ${label} for ${invoice.totalAmount.toFixed(2)} ${invoice.currency} was due on ${dueText} and hasn't been marked paid yet.

Let me know if you have any questions, or if there's anything I can help with to get this settled.

Thanks!`;
  const mailtoHref = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { subject, body, mailtoHref };
}

export function needsReminder(invoice: { status: string; lastReminderAt: Date | null }): boolean {
  if (invoice.status !== "OVERDUE") return false;
  if (!invoice.lastReminderAt) return true;
  const daysSince = (Date.now() - invoice.lastReminderAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= REMINDER_INTERVAL_DAYS;
}
