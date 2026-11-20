import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { getMembership } from "@/lib/stores";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  businessType: z.string().trim().max(80).nullable().optional(),
  monthlyRevenue: z.string().trim().max(80).nullable().optional(),
  mainProblem: z.string().trim().max(500).nullable().optional(),
});

const selection = {
  businessType: true,
  monthlyRevenue: true,
  mainProblem: true,
  onboardingCompletedAt: true,
} as const;

export async function GET(request: NextRequest, { params }: Context) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const { id: storeId } = await params;
  if (!(await getMembership(account.id, storeId, ["OWNER"]))) {
    return error("Hanya owner yang bisa melihat data onboarding", 403);
  }

  const limit = limitByAccount(account.id, "onboarding-get", 60, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: selection,
  });
  if (!store) return error("Toko tidak ditemukan", 404);

  return json(store);
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const { id: storeId } = await params;
  if (!(await getMembership(account.id, storeId, ["OWNER"]))) {
    return error("Hanya owner yang bisa menyimpan data onboarding", 403);
  }

  const limit = limitByAccount(account.id, "onboarding-save", 20, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await parseJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;

  const parsed = schema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  const store = await prisma.store.update({
    where: { id: storeId },
    data: {
      businessType: parsed.data.businessType ?? null,
      monthlyRevenue: parsed.data.monthlyRevenue ?? null,
      mainProblem: parsed.data.mainProblem ?? null,
      onboardingCompletedAt: new Date(),
    },
    select: selection,
  });

  return json({ ok: true, onboarding: store });
}
