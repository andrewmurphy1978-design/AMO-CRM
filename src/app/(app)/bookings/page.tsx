import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getHour12 } from "@/lib/time-format";
import PageHeader from "../page-header";

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-sky-50 text-sky-700",
  UPCOMING: "bg-sky-50 text-sky-700",
  PAST: "bg-black/5 text-soft",
  RESCHEDULED: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-red-50 text-red-600",
};

export default async function BookingsPage() {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);

  // One shared client — see src/lib/prisma.ts for why.
  const { bookings, hour12 } = await withScopedPrismaClient(async (db) => {
    const bookings = await db.booking.findMany({ orderBy: { scheduledFor: "desc" } });
    const hour12 = await getHour12(session, db);
    return { bookings, hour12 };
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t.bookings.title} hour12={hour12} dateLocale={dateLocale} location={t.dashboard.myLocation} />
      <p className="text-sm text-soft">{t.bookings.subtitle}</p>

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        {bookings.length === 0 ? (
          <p className="text-sm text-soft">{t.bookings.noBookingsYet}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-card-border text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wide text-soft">
                <tr>
                  <th className="py-2 pr-4">{t.bookings.colEvent}</th>
                  <th className="py-2 pr-4">{t.bookings.colWho}</th>
                  <th className="py-2 pr-4">{t.bookings.colWhen}</th>
                  <th className="py-2 pr-4">{t.bookings.colStatus}</th>
                  <th className="py-2 pr-4">{t.bookings.colPayment}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-4 font-medium text-ink">{b.eventName ?? "—"}</td>
                    <td className="py-2 pr-4 text-ink/70">
                      {b.contactName ??
                        (b.maxParticipants ? t.bookings.groupBooking(b.bookedSlots ?? 0, b.maxParticipants) : "—")}
                    </td>
                    <td className="py-2 pr-4 text-ink/70">
                      {b.scheduledFor ? format(b.scheduledFor, "PPp", { locale: dateLocale }) : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {b.status ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[b.status] ?? "bg-black/5 text-soft"}`}
                        >
                          {b.status}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-4 text-ink/70">{b.paymentStatus ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
