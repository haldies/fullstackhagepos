import { prisma } from "@/lib/prisma";
import { getCurrentAccount } from "@/lib/session";

export async function getPlatformAdmin() {
  const account = await getCurrentAccount();
  if (!account || !account.isPlatformAdmin) return null;
  return account;
}

export async function writeAudit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  meta?: Record<string, string | number | boolean>,
) {
  await prisma.auditLog.create({
    data: { actorId, action, targetType, targetId, meta },
  });
}
