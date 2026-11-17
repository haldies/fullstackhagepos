import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { getMembership } from "@/lib/stores";
import { error, json } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const { id: storeId } = await params;
  if (!(await getMembership(account.id, storeId, ["OWNER"]))) {
    return error("Hanya owner yang bisa melihat staff", 403);
  }

  const limit = limitByAccount(account.id, "staff-list", 60, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const members = await prisma.storeMember.findMany({
    where: { storeId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      staffUsername: true,
      pinHash: true,
      lockedFeatures: true,
      accessEnabled: true,
      account: { select: { email: true, name: true } },
    },
  });

  return json({
    staff: members.map((member) => ({
      id: member.id,
      role: member.role,
      staffUsername: member.staffUsername,
      hasPin: Boolean(member.pinHash),
      lockedFeatures: member.lockedFeatures,
      accessEnabled: member.accessEnabled,
      account: member.account,
    })),
  });
}
