import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { error, json } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";
import { hasOnlineAccess } from "@/lib/stores";
import { hasStoreOnlineAccess } from "@/lib/storeAccess";

export async function GET(request: NextRequest) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const limit = limitByAccount(account.id, "access-status", 60, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const requestedStoreId = request.nextUrl.searchParams.get("storeId");
  const member = await prisma.storeMember.findFirst({
    where: {
      accountId: account.id,
      ...(requestedStoreId ? { storeId: requestedStoreId } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      storeId: true,
      role: true,
      staffUsername: true,
      pinHash: true,
      lockedFeatures: true,
      accessEnabled: true,
      store: {
        select: {
          name: true,
          accessManagementEnabled: true,
        },
      },
    },
  });

  if (!member) return error("Akun ini belum terhubung ke toko", 404);

  const onlineActive =
    hasOnlineAccess(account) || (await hasStoreOnlineAccess(member.storeId));

  return json({
    storeId: member.storeId,
    storeName: member.store.name,
    role: member.role,
    accessManagementEnabled: member.store.accessManagementEnabled,
    accessEnabled: member.accessEnabled,
    onlineActive,
    staffUsername: member.staffUsername,
    hasPin: Boolean(member.pinHash),
    lockedFeatures: member.lockedFeatures,
  });
}
