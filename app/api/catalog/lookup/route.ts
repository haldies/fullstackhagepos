import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { error, json } from "@/lib/http";
import { limitByAccount } from "@/lib/rateLimit";
import { consumeScanQuota } from "@/lib/scanQuota";
import { hasAnyStoreOnlineAccess } from "@/lib/storeAccess";

// Batas scan per akun. Cukup longgar untuk input produk, tetapi membatasi bot.
const SCAN_LIMIT_PER_MINUTE = 60;
const SCAN_LIMIT_PER_DAY = 1000;

export async function GET(request: NextRequest) {
  const account = await requireAccount(request);
  if (!account) return error("Login Google diperlukan untuk scan katalog", 401);

  const perMinute = limitByAccount(account.id, "catalog-scan-minute", SCAN_LIMIT_PER_MINUTE, 60_000);
  if (!perMinute.ok) {
    return error("Scan terlalu cepat. Tunggu sebentar lalu coba lagi.", 429, {
      "Retry-After": String(perMinute.retryAfter),
    });
  }

  const perDay = limitByAccount(account.id, "catalog-scan-day", SCAN_LIMIT_PER_DAY, 24 * 60 * 60_000);
  if (!perDay.ok) {
    return error(`Batas scan harian (${SCAN_LIMIT_PER_DAY}) untuk akun ini sudah tercapai.`, 429, {
      "Retry-After": String(perDay.retryAfter),
    });
  }

  const sku = request.nextUrl.searchParams.get("sku")?.trim() ?? "";
  if (!sku) return error("sku wajib diisi", 422);
  if (sku.length > 191) return error("sku terlalu panjang", 422);

  const storeOnline = await hasAnyStoreOnlineAccess(account);
  const quota = await consumeScanQuota(
    storeOnline
      ? { ...account, onlineActive: true, onlineExpiresAt: null }
      : account,
  );
  if (!quota.allowed) {
    return error(
      `Kuota scan gratis habis (${quota.limit} scan). Langganan untuk scan tanpa batas.`,
      402,
      {
        "X-Scan-Limit": String(quota.limit),
        "X-Scan-Used": String(quota.used),
      },
    );
  }

  const product = await prisma.catalogProduct.findUnique({
    where: { skuKey: sku.toUpperCase() },
    select: {
      sku: true,
      name: true,
      brand: true,
      category: true,
      price: true,
    },
  });

  if (!product) return error("Produk tidak ada di katalog", 404);

  return json({ product });
}
