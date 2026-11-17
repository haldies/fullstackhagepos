import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { error, json } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const limit = limitByAccount(account.id, "me", 120, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const memberships = await prisma.storeMember.findMany({
    where: { accountId: account.id },
    include: { store: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return json({
    account: {
      id: account.id,
      email: account.email,
      name: account.name,
      avatarUrl: account.avatarUrl,
    },
    stores: memberships.map((m) => ({
      id: m.store.id,
      name: m.store.name,
      role: m.role,
    })),
  });
}
