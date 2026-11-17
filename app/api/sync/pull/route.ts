import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { getWritableMembership, hasOnlineAccess } from "@/lib/stores";
import { error, json } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";
import { ALLOWED_SETTING_KEYS } from "@/lib/syncPolicy";

const PAGE_SIZE = 500;

export async function GET(request: NextRequest) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);
  if (!hasOnlineAccess(account)) {
    return error("Sinkronisasi membutuhkan Langganan.", 403);
  }

  const limit = limitByAccount(account.id, "sync-pull", 60, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const storeId = request.nextUrl.searchParams.get("storeId");
  if (!storeId) return error("storeId wajib diisi", 422);

  const sinceParam = Number(request.nextUrl.searchParams.get("since") ?? "0");
  if (!Number.isFinite(sinceParam) || sinceParam < 0) return error("since tidak valid", 422);
  const since = new Date(sinceParam);

  if (!(await getWritableMembership(account.id, storeId))) {
    return error("Toko tidak ditemukan atau sedang ditangguhkan", 404);
  }

  const rows = await prisma.syncEntity.findMany({
    where: {
      storeId,
      syncedAt: { gt: since },
      // Hanya setting yang dikenal. Ini juga menyembunyikan entity lama
      // `setting/cashiers` yang berisi PIN plaintext.
      OR: [
        { kind: { not: "setting" } },
        { kind: "setting", clientId: { in: [...ALLOWED_SETTING_KEYS] } },
      ],
    },
    orderBy: { syncedAt: "asc" },
    take: PAGE_SIZE + 1,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextSince = page.length > 0 ? page[page.length - 1].syncedAt.getTime() : sinceParam;

  return json({
    entities: page.map((row) => ({
      kind: row.kind,
      clientId: row.clientId,
      updatedAt: row.updatedAt.getTime(),
      deleted: row.deletedAt !== null,
      data: row.data,
    })),
    nextSince,
    hasMore,
  });
}
