import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyGoogleIdToken } from "@/lib/google";
import { createSession, SESSION_COOKIE } from "@/lib/session";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByIp, tooManyRequests } from "@/lib/rateLimit";
import { DEFAULT_CASHIER_LOCKED_FEATURES } from "@/lib/accessPolicy";

const bodySchema = z.object({
  idToken: z.string().min(1).max(10_000),
  deviceId: z.string().max(128).optional(),
  client: z.enum(["web", "mobile"]).optional(),
});

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export async function POST(request: NextRequest) {
  const perMinute = limitByIp(request, "auth-google-minute", 20, 60_000);
  if (!perMinute.ok) return tooManyRequests(perMinute.retryAfter);

  const perHour = limitByIp(request, "auth-google-hour", 120, 60 * 60_000);
  if (!perHour.ok) return tooManyRequests(perHour.retryAfter);

  const body = await parseJsonBody(request, 16 * 1024);
  if (!body.ok) return body.response;

  const parsed = bodySchema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  let profile;
  try {
    profile = await verifyGoogleIdToken(parsed.data.idToken);
  } catch {
    return error("Token Google tidak valid", 401);
  }

  const isWebLogin = parsed.data.client === "web";

  // Dashboard web hanya untuk admin. Tidak ada bootstrap "akun pertama" lagi:
  // admin harus terdaftar di ADMIN_EMAILS atau sudah admin di database.
  if (isWebLogin) {
    const existing = await prisma.account.findUnique({
      where: { googleSub: profile.sub },
      select: { isPlatformAdmin: true },
    });
    const allowed = adminEmails.has(profile.email) || Boolean(existing?.isPlatformAdmin);
    if (!allowed) return error("Akun ini bukan admin", 403);
  }

  const shouldBeAdmin = adminEmails.has(profile.email);

  const account = await prisma.account.upsert({
    where: { googleSub: profile.sub },
    create: {
      googleSub: profile.sub,
      email: profile.email,
      isPlatformAdmin: shouldBeAdmin,
    },
    update: {
      email: profile.email,
      ...(shouldBeAdmin ? { isPlatformAdmin: true } : {}),
    },
  });

  const pendingInvites = await prisma.storeInvite.findMany({
    where: { email: profile.email },
  });
  if (pendingInvites.length > 0) {
    await prisma.$transaction([
      prisma.storeMember.createMany({
        data: pendingInvites.map((invite) => ({
          storeId: invite.storeId,
          accountId: account.id,
          role: invite.role,
          lockedFeatures: invite.role === "CASHIER"
            ? [...DEFAULT_CASHIER_LOCKED_FEATURES]
            : [],
        })),
        skipDuplicates: true,
      }),
      prisma.storeInvite.deleteMany({ where: { email: profile.email } }),
    ]);
  }

  const { token, expiresAt } = await createSession(account.id, parsed.data.deviceId);

  const response = json({
    token,
    expiresAt,
    account: {
      id: account.id,
      email: account.email,
      name: account.name,
      avatarUrl: account.avatarUrl,
      isPlatformAdmin: account.isPlatformAdmin,
    },
  });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });

  return response;
}
