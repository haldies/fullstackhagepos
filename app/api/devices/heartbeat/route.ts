import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { getWritableMembership } from "@/lib/stores";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

const bodySchema = z.object({
  storeId: z.string().min(1).max(191),
  installationId: z.string().min(1).max(128),
  platform: z.enum(["android", "ios", "web"]),
  appVersion: z.string().min(1).max(32),
  deviceName: z.string().trim().max(80).optional(),
});

export async function POST(request: NextRequest) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const limit = limitByAccount(account.id, "heartbeat", 60, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await parseJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;

  const parsed = bodySchema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  const { storeId, installationId, platform, appVersion, deviceName } = parsed.data;
  if (!(await getWritableMembership(account.id, storeId))) {
    return error("Toko tidak ditemukan atau sedang ditangguhkan", 404);
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      status: true,
      owner: {
        select: {
          onlineActive: true,
          onlineExpiresAt: true,
        },
      },
    },
  });
  if (!store || store.status !== "ACTIVE") {
    return error("Toko tidak ditemukan atau sedang ditangguhkan", 404);
  }

  const now = new Date();
  const ownerOnline =
    store.owner.onlineActive &&
    (!store.owner.onlineExpiresAt || store.owner.onlineExpiresAt.getTime() > now.getTime());
  // Langganan Online: Owner + 1 karyawan. Paket lain: 1 device aktif.
  const maxDevices = ownerOnline ? 2 : 1;

  const existing = await prisma.device.findUnique({
    where: { storeId_installationId: { storeId, installationId } },
    select: { id: true, revokedAt: true },
  });

  if (existing?.revokedAt) {
    return error("Device ini sudah dikeluarkan. Minta Owner mengaktifkan ulang.", 403);
  }

  if (!existing) {
    const activeCount = await prisma.device.count({
      where: { storeId, revokedAt: null },
    });
    if (activeCount >= maxDevices) {
      return error(
        `Batas ${maxDevices} device aktif tercapai. Keluarkan device lama terlebih dahulu.`,
        409,
        { "X-Device-Limit": String(maxDevices), "X-Device-Active": String(activeCount) },
      );
    }
  }

  await prisma.device.upsert({
    where: { storeId_installationId: { storeId, installationId } },
    create: {
      storeId,
      installationId,
      platform,
      appVersion,
      deviceName: deviceName || null,
      lastSeenAt: now,
    },
    update: {
      platform,
      appVersion,
      ...(deviceName ? { deviceName } : {}),
      lastSeenAt: now,
    },
  });

  return json({ ok: true, serverTime: now.getTime(), maxDevices });
}
