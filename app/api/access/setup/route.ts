import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

const setupSchema = z.object({
  storeId: z.string().min(1).max(191),
  username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/),
  pin: z.string().regex(/^\d{6}$/),
});

export async function POST(request: NextRequest) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const limit = limitByAccount(account.id, "access-setup", 10, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await parseJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;

  const parsed = setupSchema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  const { storeId, username, pin } = parsed.data;
  const member = await prisma.storeMember.findUnique({
    where: { storeId_accountId: { storeId, accountId: account.id } },
    select: { id: true, role: true },
  });
  if (!member) return error("Akun ini bukan anggota toko", 403);

  const existingUsername = await prisma.storeMember.findFirst({
    where: {
      storeId,
      staffUsername: { equals: username, mode: "insensitive" },
      NOT: { id: member.id },
    },
    select: { id: true },
  });
  if (existingUsername) return error("Username sudah dipakai di toko ini", 409);

  const { hashPin } = await import("@/lib/pin");
  await prisma.storeMember.update({
    where: { id: member.id },
    data: {
      staffUsername: username,
      pinHash: hashPin(pin),
      lastPinChangedAt: new Date(),
    },
  });

  return json({ ok: true, username, role: member.role });
}
