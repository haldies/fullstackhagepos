import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

const MAX_STORES_PER_ACCOUNT = 10;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export async function GET(request: NextRequest) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const limit = limitByAccount(account.id, "stores-list", 120, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const memberships = await prisma.storeMember.findMany({
    where: { accountId: account.id },
    include: { store: true },
    orderBy: { createdAt: "asc" },
  });

  return json({
    stores: memberships.map((m) => ({
      id: m.store.id,
      name: m.store.name,
      role: m.role,
      createdAt: m.store.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const limit = limitByAccount(account.id, "stores-create", 10, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await parseJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;

  const parsed = createSchema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  const owned = await prisma.store.count({ where: { ownerId: account.id } });
  if (owned >= MAX_STORES_PER_ACCOUNT) {
    return error(`Maksimal ${MAX_STORES_PER_ACCOUNT} toko per akun`, 429);
  }

  const store = await prisma.store.create({
    data: {
      name: parsed.data.name,
      ownerId: account.id,
      members: { create: { accountId: account.id, role: "OWNER" } },
    },
  });

  return json({ store: { id: store.id, name: store.name, role: "OWNER" } }, 201);
}
