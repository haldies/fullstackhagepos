import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

const bodySchema = z.object({
  storeId: z.string().min(1).max(191),
  username: z.string().trim().min(1).max(40),
  pin: z.string().min(1).max(32),
});

export async function POST(request: NextRequest) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const limit = limitByAccount(account.id, "access-pin", 8, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await parseJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;

  const parsed = bodySchema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  const { storeId, username, pin } = parsed.data;
  const member = await prisma.storeMember.findFirst({
    where: {
      storeId,
      accountId: account.id,
      staffUsername: { equals: username, mode: "insensitive" },
    },
    select: {
      id: true,
      role: true,
      pinHash: true,
      accessEnabled: true,
      lockedFeatures: true,
    },
  });

  if (!member || !member.accessEnabled) {
    return error("Username atau PIN salah", 401);
  }

  const { verifyPin } = await import("@/lib/pin");
  if (!verifyPin(pin, member.pinHash)) {
    return error("Username atau PIN salah", 401);
  }

  return json({
    ok: true,
    role: member.role,
    lockedFeatures: member.lockedFeatures,
  });
}
