import { prisma } from "./prisma";
import { checkRevenueCatOnline, isEntitlementActive } from "./revenuecat";

export const FREE_SCAN_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.SCAN_FREE_LIMIT ?? "30", 10) || 30,
);

const ONLINE_CHECK_INTERVAL_MS = 60 * 1000;

type QuotaAccount = {
  id: string;
  email: string;
  isPlatformAdmin: boolean;
  onlineActive: boolean;
  onlineExpiresAt: Date | null;
  onlineCheckedAt: Date | null;
};

export type ScanQuotaResult =
  | { allowed: true }
  | { allowed: false; limit: number; used: number };

/**
 * Scan adalah fitur online. Pengguna gratis mendapat FREE_SCAN_LIMIT scan total;
 * Langganan (bulanan/tahunan) tidak dibatasi kuota.
 * Sekali Bayar hanya membuka fitur offline, bukan scan online.
 */
export async function consumeScanQuota(account: QuotaAccount): Promise<ScanQuotaResult> {
  const hasOnline = isEntitlementActive(account.onlineActive, account.onlineExpiresAt);

  if (account.isPlatformAdmin || hasOnline) {
    await prisma.account.update({
      where: { id: account.id },
      data: { scanCount: { increment: 1 } },
    });
    return { allowed: true };
  }

  // Increment atomik: dua request bersamaan tidak bisa melewati batas.
  const updated = await prisma.$executeRaw`
    UPDATE "Account"
    SET "scanCount" = "scanCount" + 1
    WHERE "id" = ${account.id} AND "scanCount" < ${FREE_SCAN_LIMIT}
  `;

  if (updated > 0) return { allowed: true };

  // Kuota habis — cek entitlement online (cache sebentar).
  const checkedAt = account.onlineCheckedAt?.getTime() ?? 0;
  if (Date.now() - checkedAt > ONLINE_CHECK_INTERVAL_MS) {
    const status = await checkRevenueCatOnline(account.email);
    const now = new Date();

    if (status) {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          onlineActive: status.isPro,
          onlineExpiresAt: status.expiresAt,
          onlineCheckedAt: now,
        },
      });

      if (status.isPro) {
        await prisma.account.update({
          where: { id: account.id },
          data: { scanCount: { increment: 1 } },
        });
        return { allowed: true };
      }
    } else {
      // RevenueCat belum dikonfigurasi / sedang error. Jangan spam API.
      await prisma.account.update({
        where: { id: account.id },
        data: { onlineCheckedAt: now },
      });
    }
  }

  const current = await prisma.account.findUnique({
    where: { id: account.id },
    select: { scanCount: true },
  });

  return {
    allowed: false,
    limit: FREE_SCAN_LIMIT,
    used: current?.scanCount ?? FREE_SCAN_LIMIT,
  };
}
