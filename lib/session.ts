import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-kasir_session" : "kasir_session";

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // absolute: 14 hari
const IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // idle: 7 hari

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(accountId: string, deviceId?: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { accountId, tokenHash: hashToken(token), deviceId, expiresAt },
  });

  return { token, expiresAt };
}

export function readToken(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

async function getAccountByToken(token: string | null) {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { account: true },
  });
  if (!session) return null;

  const now = new Date();
  if (session.expiresAt < now) {
    prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const lastUsed = session.lastUsedAt ?? session.createdAt;
  if (now.getTime() - lastUsed.getTime() > IDLE_TTL_MS) {
    prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  prisma.session
    .update({ where: { id: session.id }, data: { lastUsedAt: now } })
    .catch(() => {});

  return session.account;
}

export async function requireAccount(request: NextRequest) {
  return getAccountByToken(readToken(request));
}

export async function getCurrentAccount() {
  const store = await cookies();
  return getAccountByToken(store.get(SESSION_COOKIE)?.value ?? null);
}

/**
 * Cabut sesi saat ini. Dengan `all = true`, cabut semua sesi akun
 * (logout dari semua perangkat).
 */
export async function revokeSession(request: NextRequest, all = false) {
  const token = readToken(request);
  if (!token) return;

  const tokenHash = hashToken(token);
  if (!all) {
    await prisma.session.deleteMany({ where: { tokenHash } });
    return;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: { accountId: true },
  });
  if (!session) return;

  await prisma.session.deleteMany({ where: { accountId: session.accountId } });
}
