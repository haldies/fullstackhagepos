import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { getMembership } from "@/lib/stores";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";
import { DEFAULT_CASHIER_LOCKED_FEATURES } from "@/lib/accessPolicy";

type Context = { params: Promise<{ id: string }> };

const inviteSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  role: z.enum(["OWNER", "CASHIER"]).default("CASHIER"),
});

export async function GET(request: NextRequest, { params }: Context) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const { id: storeId } = await params;
  // Daftar member berisi email/PII — hanya owner yang boleh melihat.
  if (!(await getMembership(account.id, storeId, ["OWNER"]))) {
    return error("Hanya owner yang bisa melihat daftar anggota", 403);
  }

  const limit = limitByAccount(account.id, "member-list", 60, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const [members, invites] = await Promise.all([
    prisma.storeMember.findMany({
      where: { storeId },
      include: { account: { select: { id: true, email: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.storeInvite.findMany({ where: { storeId }, orderBy: { createdAt: "asc" } }),
  ]);

  return json({
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      account: m.account,
    })),
    invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role })),
  });
}

export async function POST(request: NextRequest, { params }: Context) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const { id: storeId } = await params;
  if (!(await getMembership(account.id, storeId, ["OWNER"]))) {
    return error("Hanya owner yang bisa mengundang", 403);
  }

  const limit = limitByAccount(account.id, "member-invite", 30, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await parseJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;

  const parsed = inviteSchema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  const existingAccount = await prisma.account.findUnique({
    where: { email: parsed.data.email },
  });

  if (existingAccount) {
    const member = await prisma.storeMember.upsert({
      where: { storeId_accountId: { storeId, accountId: existingAccount.id } },
      create: {
        storeId,
        accountId: existingAccount.id,
        role: parsed.data.role,
        lockedFeatures: parsed.data.role === "CASHIER"
          ? [...DEFAULT_CASHIER_LOCKED_FEATURES]
          : [],
      },
      update: { role: parsed.data.role },
    });
    return json({ joined: true, memberId: member.id }, 201);
  }

  const invite = await prisma.storeInvite.upsert({
    where: { storeId_email: { storeId, email: parsed.data.email } },
    create: { storeId, email: parsed.data.email, role: parsed.data.role },
    update: { role: parsed.data.role },
  });

  return json({ joined: false, inviteId: invite.id }, 201);
}
