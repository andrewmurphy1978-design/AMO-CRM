"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { splitPhoneExtension } from "@/lib/phone-display";
import { getTimezoneFromAreaCode } from "@/lib/timezone";

export interface BackfillContactDataResult {
  error?: string;
  success?: string;
  phoneNumbersFixed?: number;
  timeZonesFilled?: number;
}

// Adds a missing NANP country code to a phone number stored without one
// (e.g. "(450) 821-3336" or the 11-digit "18193237604") — every number
// already confirmed to be North American, so "+1" is always the right
// prefix here, never a guess between countries. Leaves anything already
// carrying a "+" (any country) or with an unexpected digit count
// untouched rather than risk mangling something genuinely different.
function withCountryCode(value: string): string {
  if (value.trim().startsWith("+")) return value;
  const { number, ext } = splitPhoneExtension(value);
  const digits = number.replace(/\D/g, "");
  let fixedNumber: string;
  if (digits.length === 10) fixedNumber = `+1 ${number}`;
  else if (digits.length === 11 && digits.startsWith("1")) fixedNumber = `+${number}`;
  else return value;
  return ext ? `${fixedNumber} x${ext}` : fixedNumber;
}

// One-off data-quality pass, run by hand from Settings: adds "+1" to any
// phone number stored without a country code (safe here specifically
// because this CRM's contacts are confirmed all North American — see
// withCountryCode's comment), and fills a still-empty timeZone from the
// first phone number's area code — the one signal a phone-only personal
// contact (no address on file) usually has. Never overwrites a phone
// number that already has a country code, or a timeZone that's already
// set; safe to run more than once.
export async function backfillContactDataAction(): Promise<BackfillContactDataResult> {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Only admins can run this." };

  return withScopedPrismaClient(async (db) => {
    const contacts = await db.contact.findMany({
      select: { id: true, phone: true, phone2: true, extraPhones: true, timeZone: true },
    });

    let phoneNumbersFixed = 0;
    let timeZonesFilled = 0;

    for (const c of contacts) {
      const data: { phone?: string; phone2?: string; extraPhones?: string[]; timeZone?: string } = {};

      if (c.phone && !c.phone.trim().startsWith("+")) {
        const fixed = withCountryCode(c.phone);
        if (fixed !== c.phone) {
          data.phone = fixed;
          phoneNumbersFixed += 1;
        }
      }
      if (c.phone2 && !c.phone2.trim().startsWith("+")) {
        const fixed = withCountryCode(c.phone2);
        if (fixed !== c.phone2) {
          data.phone2 = fixed;
          phoneNumbersFixed += 1;
        }
      }
      if (c.extraPhones.length > 0) {
        const fixedExtras = c.extraPhones.map((p) => (p.trim().startsWith("+") ? p : withCountryCode(p)));
        const changedCount = fixedExtras.filter((p, i) => p !== c.extraPhones[i]).length;
        if (changedCount > 0) {
          data.extraPhones = fixedExtras;
          phoneNumbersFixed += changedCount;
        }
      }

      // Specifically the first phone number, per how this was asked for —
      // phone2/extraPhones aren't consulted even if the first is missing.
      if (!c.timeZone && c.phone) {
        const tz = getTimezoneFromAreaCode(c.phone);
        if (tz) {
          data.timeZone = tz;
          timeZonesFilled += 1;
        }
      }

      if (Object.keys(data).length > 0) {
        await db.contact.update({ where: { id: c.id }, data });
      }
    }

    revalidatePath("/contacts");
    return { success: "done", phoneNumbersFixed, timeZonesFilled };
  });
}
