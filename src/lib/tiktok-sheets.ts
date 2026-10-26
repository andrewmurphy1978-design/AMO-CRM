import { getValidAccessToken } from "@/lib/google";
import type { PrismaClient } from "@/lib/prisma";

// The Make scenario "Social Media Poster" adds one row per TikTok post to a Google Sheet (columns: date added, media
// URL, message, status "pending"), one sheet per language. Reading them is the only way to confirm TikTok posts were
// queued, because the posts leave the Make queue as soon as the row is written.
export const TIKTOK_SHEETS = [
  { language: "EN", id: "1ok5Xc27DKsPLQ72gEZ9FLMxfKtS6iKGjjTCBhHPY5gg" },
  { language: "FR", id: "1PAoDNriB2mzyDay7Iya1nrAUMaXP3AuuVa3X7dac_xc" },
] as const;

export interface TiktokSheetCounts {
  rows: number; // data rows (header excluded)
  pending: number; // rows whose status is still "pending"
  recent: number; // rows added in the last 7 days
}

function toMillis(v: unknown): number | null {
  if (typeof v === "number") return Math.round((v - 25569) * 86_400_000); // Sheets serial date
  if (typeof v === "string" && v) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Counts the TikTok rows in both sheets with the signed-in user's Google account. */
export async function readTiktokSheets(db: PrismaClient, userId: string): Promise<{ ok: true; counts: TiktokSheetCounts } | { ok: false; error: string }> {
  const token = await getValidAccessToken(userId, db);
  if (!token) return { ok: false, error: "Google is not connected for this user (Settings > Google)" };
  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const counts: TiktokSheetCounts = { rows: 0, pending: 0, recent: 0 };
  for (const sheet of TIKTOK_SHEETS) {
    const range = encodeURIComponent("'Feuille 1'!A2:D");
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheet.id}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status === 401 || res.status === 403) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string; status?: string; details?: { reason?: string }[] } } | null;
      const reason = body?.error?.details?.[0]?.reason ?? body?.error?.status ?? "";
      const detail = body?.error?.message ? ` Google says: ${body.error.message}` : "";
      if (reason === "SERVICE_DISABLED" || /has not been used|is disabled/i.test(body?.error?.message ?? "")) {
        return { ok: false, error: `The Google Sheets API is not enabled for the CRM's Google project — enable it in Google Cloud Console (APIs & Services > Library > Google Sheets API).${detail}` };
      }
      if (/insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(`${reason} ${body?.error?.message ?? ""}`)) {
        return { ok: false, error: "This Google connection was made before Sheets access was added — disconnect and reconnect Google in Settings and accept the spreadsheets permission." };
      }
      return { ok: false, error: `Google refused access to the TikTok sheet (${res.status}).${detail}` };
    }
    if (res.status === 404) return { ok: false, error: `The ${sheet.language} TikTok sheet was not found with this Google account` };
    if (!res.ok) return { ok: false, error: `Google Sheets answered ${res.status}` };
    const data = (await res.json()) as { values?: unknown[][] };
    for (const row of data.values ?? []) {
      if (!row.some((c) => c !== "" && c != null)) continue;
      counts.rows += 1;
      if (String(row[3] ?? "").toLowerCase() === "pending") counts.pending += 1;
      const added = toMillis(row[0]);
      if (added !== null && added >= sevenDaysAgo) counts.recent += 1;
    }
  }
  return { ok: true, counts };
}
