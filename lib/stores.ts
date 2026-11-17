import { prisma } from "@/lib/prisma";

type Role = "OWNER" | "CASHIER";

export async function getMembership(accountId: string, storeId: string, roles?: Role[]) {
  const membership = await prisma.storeMember.findUnique({
    where: { storeId_accountId: { storeId, accountId } },
  });
  if (!membership) return null;
  if (roles && !roles.includes(membership.role)) return null;
  return membership;
}

export async function getWritableMembership(accountId: string, storeId: string) {
  const membership = await getMembership(accountId, storeId);
  if (!membership) return null;

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { status: true },
  });
  if (!store || store.status !== "ACTIVE") return null;

  return membership;
}

/** Akses fitur online (sinkronisasi & scan unlimited). */
export function hasOnlineAccess(account: {
  onlineActive: boolean;
  onlineExpiresAt: Date | null;
}) {
  return (
    account.onlineActive &&
    (!account.onlineExpiresAt || account.onlineExpiresAt.getTime() > Date.now())
  );
}
