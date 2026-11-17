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

  const { storeId, installationId, platform, appVersion } = parsed.data;
  if (!(await getWritableMembership(account.id, storeId))) {
    return error("Toko tidak ditemukan atau sedang ditangguhkan", 404);
  }

  // Satu HP = satu installationId stabil (Android ID). Tidak ada batas
  // jumlah instalasi arbitrer; device yang sama akan di-upsert.
  const now = new Date();
  await prisma.device.upsert({
    where: { storeId_installationId: { storeId, installationId } },
    create: { storeId, installationId, platform, appVersion, lastSeenAt: now },
    update: { platform, appVersion, lastSeenAt: now },
  });

  return json({ ok: true, serverTime: now.getTime() });
}
