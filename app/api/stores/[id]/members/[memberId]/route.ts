import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { getMembership } from "@/lib/stores";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

type Context = { params: Promise<{ id: string; memberId: string }> };

const updateSchema = z.object({
  role: z.enum(["OWNER", "CASHIER"]),
});

export async function PATCH(request: NextRequest, { params }: Context) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const { id: storeId, memberId } = await params;
  if (!(await getMembership(account.id, storeId, ["OWNER"]))) {
    return error("Hanya owner yang bisa mengubah role", 403);
  }

  const limit = limitByAccount(account.id, "member-update", 60, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await parseJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;

  const parsed = updateSchema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  const target = await prisma.storeMember.findFirst({ where: { id: memberId, storeId } });
  if (!target) return error("Member tidak ditemukan", 404);

  if (target.role === "OWNER" && parsed.data.role !== "OWNER") {
    const owners = await prisma.storeMember.count({ where: { storeId, role: "OWNER" } });
    if (owners <= 1) return error("Store harus punya minimal satu owner", 409);
  }

  const updated = await prisma.storeMember.update({
    where: { id: memberId },
    data: { role: parsed.data.role },
  });

  return json({ id: updated.id, role: updated.role });
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const { id: storeId, memberId } = await params;
  if (!(await getMembership(account.id, storeId, ["OWNER"]))) {
    return error("Hanya owner yang bisa menghapus member", 403);
  }

  const limit = limitByAccount(account.id, "member-delete", 60, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const target = await prisma.storeMember.findFirst({ where: { id: memberId, storeId } });
  if (!target) return error("Member tidak ditemukan", 404);

  if (target.role === "OWNER") {
    const owners = await prisma.storeMember.count({ where: { storeId, role: "OWNER" } });
    if (owners <= 1) return error("Store harus punya minimal satu owner", 409);
  }

  await prisma.storeMember.delete({ where: { id: memberId } });
  return json({ ok: true });
}
