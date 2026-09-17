"use client";

// The Email page itself is a Server Component (it does a batch of Prisma
// reads), but formatting a date with Intl.DateTimeFormat needs to run in
// the *browser* to pick up the visitor's real local timezone — on
// Cloudflare Workers there's no meaningful local timezone, so doing this
// formatting server-side (as the page briefly did) rendered every time in
// UTC/Zulu instead. The Dashboard's email card gets this right already
// because it's a client component; this is the same fix, pulled out just
// far enough to keep the rest of the page server-rendered.
export default function EmailTime({ iso, hour12, intlLocale }: { iso: string; hour12: boolean; intlLocale: string }) {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat(intlLocale, { hour: "numeric", minute: "2-digit", hour12 }).format(date);
  if (date.toDateString() === new Date().toDateString()) return <>{time}</>;
  const day = new Intl.DateTimeFormat(intlLocale, { month: "short", day: "numeric" }).format(date);
  return (
    <>
      {day}, {time}
    </>
  );
}
