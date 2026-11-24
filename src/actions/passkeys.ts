"use server";

import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

export interface PasskeyItem {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listMyPasskeys(): Promise<PasskeyItem[]> {
  const session = await auth();
  if (!session) return [];
  const rows = await withScopedPrismaClient((db) =>
    db.passkey.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" }, select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true } })
  );
  return rows.map((r) => ({ id: r.id, deviceName: r.deviceName, createdAt: r.createdAt.toISOString(), lastUsedAt: r.lastUsedAt?.toISOString() ?? null }));
}

export async function deletePasskey(id: string): Promise<void> {
  const session = await auth();
  if (!session) return;
  await withScopedPrismaClient((db) => db.passkey.deleteMany({ where: { id, userId: session.user.id } }));
}
