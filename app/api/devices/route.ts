import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { getMembership } from "@/lib/stores";
import { error, json } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const storeId = request.nextUrl.searchParams.get("storeId");
  if (!storeId) return error("storeId wajib diisi", 422);

  if (!(await getMembership(account.id, storeId, ["OWNER"]))) {
    return error("Hanya owner yang bisa melihat device", 403);
  }

  const limit = limitByAccount(account.id, "device-list", 60, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const devices = await prisma.device.findMany({
    where: { storeId },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      deviceName: true,
      installationId: true,
      platform: true,
      appVersion: true,
      lastSeenAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return json({
    devices: devices.map((device) => ({
      ...device,
      // Jangan kirim identifier penuh ke UI.
      installationId: `${device.installationId.slice(0, 10)}…`,
    })),
  });
}
