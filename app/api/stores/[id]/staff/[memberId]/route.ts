import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { getMembership } from "@/lib/stores";
import { hashPin } from "@/lib/pin";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

type Context = { params: Promise<{ id: string; memberId: string }> };

const schema = z.object({
  role: z.enum(["OWNER", "CASHIER"]).optional(),
  staffUsername: z.string().trim().min(3).max(40).nullable().optional(),
  pin: z.string().regex(/^\d{6}$/).nullable().optional(),
  lockedFeatures: z.array(z.string().max(80)).max(80).optional(),
  accessEnabled: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: Context) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const { id: storeId, memberId } = await params;
  if (!(await getMembership(account.id, storeId, ["OWNER"]))) {
    return error("Hanya owner yang bisa mengubah staff", 403);
  }

  const limit = limitByAccount(account.id, "staff-update", 60, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await parseJsonBody(request, 16 * 1024);
  if (!body.ok) return body.response;

  const parsed = schema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  const target = await prisma.storeMember.findFirst({
    where: { id: memberId, storeId },
  });
  if (!target) return error("Staff tidak ditemukan", 404);

  const nextRole = parsed.data.role ?? target.role;
  if (target.role === "OWNER" && nextRole !== "OWNER") {
    const owners = await prisma.storeMember.count({ where: { storeId, role: "OWNER" } });
    if (owners <= 1) return error("Toko harus punya minimal satu owner", 409);
  }

  if (parsed.data.staffUsername) {
    const duplicate = await prisma.storeMember.findFirst({
      where: {
        storeId,
        staffUsername: { equals: parsed.data.staffUsername, mode: "insensitive" },
        NOT: { id: memberId },
      },
      select: { id: true },
    });
    if (duplicate) return error("Username sudah dipakai", 409);
  }

  const updated = await prisma.storeMember.update({
    where: { id: memberId },
    data: {
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
      ...(parsed.data.staffUsername !== undefined
        ? { staffUsername: parsed.data.staffUsername }
        : {}),
      ...(parsed.data.pin === null
        ? { pinHash: null, lastPinChangedAt: new Date() }
        : parsed.data.pin
          ? { pinHash: hashPin(parsed.data.pin), lastPinChangedAt: new Date() }
          : {}),
      ...(parsed.data.lockedFeatures ? { lockedFeatures: parsed.data.lockedFeatures } : {}),
      ...(parsed.data.accessEnabled !== undefined
        ? { accessEnabled: parsed.data.accessEnabled }
        : {}),
    },
  });

  return json({
    ok: true,
    id: updated.id,
    role: updated.role,
    staffUsername: updated.staffUsername,
    lockedFeatures: updated.lockedFeatures,
    accessEnabled: updated.accessEnabled,
  });
}
