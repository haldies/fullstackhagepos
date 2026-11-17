import { prisma } from "@/lib/prisma";

function active(onlineActive: boolean, onlineExpiresAt: Date | null) {
  return onlineActive && (!onlineExpiresAt || onlineExpiresAt.getTime() > Date.now());
}

export async function hasStoreOnlineAccess(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { owner: { select: { onlineActive: true, onlineExpiresAt: true } } },
  });
  if (!store) return false;
  return active(store.owner.onlineActive, store.owner.onlineExpiresAt);
}

/**
 * Karyawan mengikuti langganan toko. Jika akun punya langganan sendiri,
 * tetap diizinkan; kalau tidak, cek apakah salah satu toko yang diikuti
 * memiliki Owner dengan langganan online aktif.
 */
export async function hasAnyStoreOnlineAccess(account: {
  id: string;
  onlineActive: boolean;
  onlineExpiresAt: Date | null;
}) {
  if (active(account.onlineActive, account.onlineExpiresAt)) return true;

  const memberships = await prisma.storeMember.findMany({
    where: { accountId: account.id },
    select: {
      store: {
        select: {
          owner: { select: { onlineActive: true, onlineExpiresAt: true } },
        },
      },
    },
    take: 20,
  });

  return memberships.some((m) =>
    active(m.store.owner.onlineActive, m.store.owner.onlineExpiresAt),
  );
}
