"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Only admins can manage email signatures");
  }
  return session;
}

export interface EmailSignatureRow {
  id: string;
  name: string;
  htmlEn: string;
  htmlFr: string;
  accounts: string[];
  useForNew: boolean;
  useForReply: boolean;
  useForForward: boolean;
}

// Settings page's own list — admin-only, same as every other integration
// config on that page.
export async function listEmailSignaturesAction(): Promise<EmailSignatureRow[]> {
  await requireAdmin();
  return withScopedPrismaClient((db) => db.emailSignature.findMany({ orderBy: { createdAt: "asc" } }));
}

export interface EmailSignatureInput {
  name: string;
  htmlEn: string;
  htmlFr: string;
  accounts: string[]; // empty = every connected account
  useForNew: boolean;
  useForReply: boolean;
  useForForward: boolean;
}

export async function saveEmailSignatureAction(id: string | null, data: EmailSignatureInput): Promise<{ error?: string; id?: string }> {
  await requireAdmin();
  const name = data.name.trim();
  if (!name) return { error: "name_required" };

  const fields = {
    name,
    htmlEn: data.htmlEn,
    htmlFr: data.htmlFr,
    accounts: data.accounts,
    useForNew: data.useForNew,
    useForReply: data.useForReply,
    useForForward: data.useForForward,
  };
  const row = await withScopedPrismaClient((db) =>
    id ? db.emailSignature.update({ where: { id }, data: fields }) : db.emailSignature.create({ data: fields })
  );
  revalidatePath("/settings");
  return { id: row.id };
}

export async function deleteEmailSignatureAction(id: string): Promise<void> {
  await requireAdmin();
  await withScopedPrismaClient((db) => db.emailSignature.delete({ where: { id } }));
  revalidatePath("/settings");
}

export type ComposeSignatureMode = "new" | "reply" | "forward";

// The Compose dialog's own lookup — not admin-gated, since any
// authenticated user composing mail needs their signature applied, not
// just whoever manages the Settings list. Picks the first signature
// (creation order) that both applies to this account (an empty
// `accounts` list means "every account") and is flagged for this compose
// mode — see EmailSignature's own schema comment for why "first match"
// is an acceptable rule rather than an error on overlap — then returns
// whichever language body matches the composing user's own UI language
// (a signature's FR/EN wording is written independently, not machine-
// translated, so this picks the stored body rather than translating).
export async function resolveComposeSignatureAction(accountAddress: string, mode: ComposeSignatureMode): Promise<string | null> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  return withScopedPrismaClient(async (db) => {
    const modeFilter =
      mode === "new" ? { useForNew: true } : mode === "reply" ? { useForReply: true } : { useForForward: true };
    const rows = await db.emailSignature.findMany({ where: modeFilter, orderBy: { createdAt: "asc" } });
    const normalized = accountAddress.toLowerCase();
    const match = rows.find((r) => r.accounts.length === 0 || r.accounts.some((a) => a.toLowerCase() === normalized));
    if (!match) return null;
    const html = session.user.language === "FR" ? match.htmlFr : match.htmlEn;
    return html || (session.user.language === "FR" ? match.htmlEn : match.htmlFr) || null;
  });
}
