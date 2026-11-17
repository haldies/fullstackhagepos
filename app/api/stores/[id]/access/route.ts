import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { getMembership } from "@/lib/stores";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({ enabled: z.boolean() });

export async function PATCH(request: NextRequest, { params }: Context) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const { id: storeId } = await params;
  if (!(await getMembership(account.id, storeId, ["OWNER"]))) {
    return error("Hanya owner yang bisa mengubah manajemen akses", 403);
  }

  const limit = limitByAccount(account.id, "access-toggle", 20, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await parseJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;

  const parsed = schema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  await prisma.store.update({
    where: { id: storeId },
    data: { accessManagementEnabled: parsed.data.enabled },
  });

  return json({ ok: true, enabled: parsed.data.enabled });
}
