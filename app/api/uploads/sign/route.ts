import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireAccount } from "@/lib/session";
import { getWritableMembership } from "@/lib/stores";
import { hasStoreFeature } from "@/lib/storeAccess";
import { R2_BUCKET, isR2Configured, r2 } from "@/lib/r2";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const SIGN_LIMIT_PER_MINUTE = 30;
const SIGN_LIMIT_PER_DAY = 200;

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

const bodySchema = z.object({
  storeId: z.string().min(1).max(191),
  kind: z.enum(["product", "store", "qris"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive().max(MAX_IMAGE_BYTES),
});

export async function POST(request: NextRequest) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  if (!isR2Configured()) return error("Penyimpanan gambar belum dikonfigurasi", 503);

  const perMinute = limitByAccount(account.id, "upload-sign-minute", SIGN_LIMIT_PER_MINUTE, 60_000);
  if (!perMinute.ok) return tooManyRequests(perMinute.retryAfter);

  const perDay = limitByAccount(account.id, "upload-sign-day", SIGN_LIMIT_PER_DAY, 24 * 60 * 60_000);
  if (!perDay.ok) return tooManyRequests(perDay.retryAfter);

  const body = await parseJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;

  const parsed = bodySchema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  const { storeId, kind, contentType, sizeBytes } = parsed.data;
  const membership = await getWritableMembership(account.id, storeId);
  if (!membership) {
    return error("Toko tidak ditemukan atau sedang ditangguhkan", 404);
  }

  // Logo toko & QRIS mengikuti izin Manajemen Akses; owner selalu boleh.
  if (kind === "store" && !(await hasStoreFeature(account.id, storeId, "store-profile"))) {
    return error("Tidak punya izin mengganti gambar toko", 403);
  }
  if (kind === "qris" && !(await hasStoreFeature(account.id, storeId, "qris-settings"))) {
    return error("Tidak punya izin mengganti gambar QRIS", 403);
  }

  // Prefix `tmp/` dibersihkan otomatis oleh lifecycle R2 jika tidak dikonfirmasi.
  const key = `tmp/${storeId}/${kind}/${randomUUID()}.${EXTENSIONS[contentType]}`;

  const uploadUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    }),
    { expiresIn: 300 },
  );

  return json({ uploadUrl, key, expiresInSeconds: 300 });
}
