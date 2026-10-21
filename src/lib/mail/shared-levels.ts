// Client-safe: how far a team member may go in a shared mailbox. There is deliberately no delete level.
export type MailboxLevel = "NONE" | "READ" | "SEND" | "COMPLETE";
export const MAILBOX_LEVELS: MailboxLevel[] = ["NONE", "READ", "SEND", "COMPLETE"];
const RANK: Record<MailboxLevel, number> = { NONE: 0, READ: 1, SEND: 2, COMPLETE: 3 };
export const mailboxAtLeast = (have: MailboxLevel, need: MailboxLevel) => RANK[have] >= RANK[need];
export const MAILBOX_PRESETS = [
  { provider: "google", label: "Google Workspace / Gmail", imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 465 },
  { provider: "microsoft", label: "Microsoft 365 / Outlook", imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 },
  { provider: "ionos", label: "IONOS", imapHost: "imap.ionos.com", imapPort: 993, smtpHost: "smtp.ionos.com", smtpPort: 465 },
  { provider: "imap", label: "Other (IMAP / SMTP)", imapHost: "", imapPort: 993, smtpHost: "", smtpPort: 465 },
] as const;
