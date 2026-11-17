"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPlatformAdmin, writeAudit } from "@/lib/admin";

type Result = { ok: true } | { ok: false; error: string };

export async function setStoreStatus(storeId: string, status: "ACTIVE" | "SUSPENDED"): Promise<Result> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: "Tidak punya akses" };

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { status: true } });
  if (!store) return { ok: false, error: "Toko tidak ditemukan" };

  await prisma.store.update({ where: { id: storeId }, data: { status } });
  await writeAudit(admin.id, "store.status", "store", storeId, {
    from: store.status,
    to: status,
  });

  revalidatePath(`/admin/stores/${storeId}`);
  revalidatePath("/admin/stores");
  return { ok: true };
}

export async function revokeOwnerSessions(storeId: string): Promise<Result> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: "Tidak punya akses" };

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { ownerId: true } });
  if (!store) return { ok: false, error: "Toko tidak ditemukan" };

  const { count } = await prisma.session.deleteMany({ where: { accountId: store.ownerId } });
  await writeAudit(admin.id, "owner.revoke_sessions", "store", storeId, { revoked: count });

  revalidatePath(`/admin/stores/${storeId}`);
  return { ok: true };
}
