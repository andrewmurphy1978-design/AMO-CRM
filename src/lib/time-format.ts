import { prisma, type PrismaClient } from "@/lib/prisma";

// Reads the signed-in user's 24h/12h preference fresh from the DB rather
// than the JWT session — the session is only reissued at login, so it
// would keep showing the old value right after saving the setting.
export async function getHour12(
  session: { user: { id: string } } | null,
  db: PrismaClient = prisma
): Promise<boolean> {
  if (!session) return false;
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { timeFormat: true } });
  return user?.timeFormat === "HOUR12";
}
