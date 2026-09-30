import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getHour12 } from "@/lib/time-format";
import PageHeader from "../page-header";
import SmsInbox, { type UnlinkedGroup, type NewText } from "./sms-inbox";

// The SMS inbox: incoming texts nobody has looked at yet, plus texts from
// numbers that match no contact (those stay here until linked).
export default async function SmsPage() {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);

  const { unlinked, fresh, contacts, hour12 } = await withScopedPrismaClient(async (db) => {
    const unlinked = await db.interaction.findMany({
      where: { type: "SMS", direction: "INBOUND", contactId: null },
      orderBy: { occurredAt: "desc" },
    });
    const fresh = await db.interaction.findMany({
      where: { type: "SMS", direction: "INBOUND", contactId: { not: null }, seenAt: null },
      orderBy: { occurredAt: "desc" },
      include: { contact: { select: { id: true, firstName: true, lastName: true, company: true } } },
    });
    const contacts = await db.contact.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, company: true, email: true },
    });
    const hour12 = await getHour12(session, db);
    return { unlinked, fresh, contacts, hour12 };
  });

  // One row per unknown number, with all of its texts.
  const groups = new Map<string, UnlinkedGroup>();
  for (const text of unlinked) {
    const number = text.externalNumber ?? "?";
    const group = groups.get(number) ?? { number, texts: [] };
    group.texts.push({ id: text.id, text: text.notes, receivedAt: text.occurredAt.toISOString() });
    groups.set(number, group);
  }

  const newTexts: NewText[] = fresh.map((i) => ({
    id: i.id,
    contactId: i.contact?.id ?? "",
    contactName: [i.contact?.firstName, i.contact?.lastName].filter(Boolean).join(" ") || i.contact?.company || "—",
    text: i.notes,
    receivedAt: i.occurredAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader title={t.nav.sms} hour12={hour12} lang={lang} location={t.dashboard.myLocation} />
      <p className="text-sm text-soft">{t.smsPage.subtitle}</p>
      <SmsInbox
        unlinked={[...groups.values()]}
        newTexts={newTexts}
        contacts={contacts.map((c) => ({
          id: c.id,
          label: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || c.email || "—",
        }))}
        lang={lang}
      />
    </div>
  );
}
