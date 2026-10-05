import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@/lib/prisma";
import type { BrandItemRow } from "@/app/(app)/contacts/[id]/brand-card";

// A client's Brand card rows WITHOUT the uploaded files' bytes: those live in the database as huge data:
// URIs and would end up inside the page. A file shows as "kept:<id>" (plus its mime type) and is
// fetched as an image from /api/brand-files/<id>; saving the card turns "kept:<id>" back into the file.
export async function loadBrandRows(db: PrismaClient, contactId: string): Promise<BrandItemRow[]> {
  const rows = await db.$queryRaw<{ id: string; category: string; label: string; value: string | null; note: string | null; mime: string | null }[]>(Prisma.sql`
    SELECT id, category, label,
           CASE WHEN value LIKE 'data:%' THEN 'kept:' || id ELSE value END AS value,
           note,
           CASE WHEN value LIKE 'data:%' THEN substring(value from '^data:([^;]+);') ELSE NULL END AS mime
    FROM contact_brand_items
    WHERE "contactId" = ${contactId}
    ORDER BY category ASC, "order" ASC
  `);
  return rows.map((r) => ({ id: r.id, category: r.category, label: r.label, value: r.value ?? "", note: r.note ?? "", mime: r.mime ?? undefined }));
}
