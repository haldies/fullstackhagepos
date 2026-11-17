import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { getMembership } from "@/lib/stores";
import { error, json } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

type Context = { params: Promise<{ id: string }> };

const TRANSFER_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export async function DELETE(request: NextRequest, { params }: Context) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const { id } = await params;
  const device = await prisma.device.findUnique({
    where: { id },
    select: { id: true, storeId: true, revokedAt: true },
  });
  if (!device) return error("Device tidak ditemukan", 404);

  if (!(await getMembership(account.id, device.storeId, ["OWNER"]))) {
    return error("Hanya owner yang bisa mengeluarkan device", 403);
  }

  const limit = limitByAccount(account.id, "device-revoke", 30, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  if (device.revokedAt) return json({ ok: true });

  const store = await prisma.store.findUnique({
    where: { id: device.storeId },
    select: {
      lastDeviceChangeAt: true,
      owner: { select: { onlineActive: true, onlineExpiresAt: true } },
    },
  });
  if (!store) return error("Toko tidak ditemukan", 404);

  const now = new Date();
  const ownerOnline =
    store.owner.onlineActive &&
    (!store.owner.onlineExpiresAt || store.owner.onlineExpiresAt.getTime() > now.getTime());

  // Pada paket offline, pindah device dibatasi 1x per 30 hari.
  if (!ownerOnline && store.lastDeviceChangeAt) {
    const elapsed = now.getTime() - store.lastDeviceChangeAt.getTime();
    if (elapsed < TRANSFER_COOLDOWN_MS) {
      const days = Math.ceil((TRANSFER_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
      return error(`Pindah device baru bisa dilakukan lagi dalam ${days} hari.`, 429);
    }
  }

  await prisma.$transaction([
    prisma.device.update({
      where: { id: device.id },
      data: { revokedAt: now },
    }),
    prisma.store.update({
      where: { id: device.storeId },
      data: { lastDeviceChangeAt: now },
    }),
  ]);

  return json({ ok: true });
}
