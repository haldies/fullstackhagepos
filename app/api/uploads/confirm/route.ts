import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { requireAccount } from "@/lib/session";
import { getWritableMembership } from "@/lib/stores";
import { R2_BUCKET, R2_PUBLIC_BASE_URL, isR2Configured, r2 } from "@/lib/r2";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const CONTENT_TYPE_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

const bodySchema = z.object({
  key: z.string().min(1).max(300),
});

const TMP_KEY_PATTERN = /^tmp\/([^/]+)\/(product|store|qris)\/([0-9a-f-]{36})\.(jpg|png|webp)$/i;

function hasImageSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (contentType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  return (
    contentType === "image/webp" &&
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}

export async function POST(request: NextRequest) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);
  if (!isR2Configured()) return error("Penyimpanan gambar belum dikonfigurasi", 503);

  const limit = limitByAccount(account.id, "upload-confirm", 60, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await parseJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;

  const parsed = bodySchema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  const { key } = parsed.data;
  const match = TMP_KEY_PATTERN.exec(key);
  if (!match) return error("Key upload tidak valid", 400);

  const [, storeId, kind, uuid] = match;
  const membership = await getWritableMembership(account.id, storeId);
  if (!membership) return error("Tidak punya akses ke gambar ini", 404);
  if (membership.role !== "OWNER" && (kind === "store" || kind === "qris")) {
    return error("Hanya owner yang boleh mengganti gambar toko/QRIS", 403);
  }

  let head;
  try {
    head = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch {
    return error("Gambar tidak ditemukan", 404);
  }

  const size = head.ContentLength ?? 0;
  const contentType = head.ContentType ?? "";
  const extension = CONTENT_TYPE_TO_EXT[contentType as keyof typeof CONTENT_TYPE_TO_EXT];

  if (size <= 0 || size > MAX_IMAGE_BYTES || !extension) {
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })).catch(() => {});
    return error("Ukuran atau tipe gambar tidak valid", 422);
  }

  try {
    const firstBytes = await r2.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Range: "bytes=0-11",
      }),
    );
    const bytes = firstBytes.Body ? await firstBytes.Body.transformToByteArray() : new Uint8Array();
    if (!hasImageSignature(contentType, bytes)) {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })).catch(() => {});
      return error("Isi file bukan gambar yang valid", 422);
    }
  } catch {
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })).catch(() => {});
    return error("Gambar tidak dapat diverifikasi", 422);
  }

  const finalKey = `${storeId}/${kind}/${uuid}.${extension}`;

  try {
    await r2.send(
      new CopyObjectCommand({
        Bucket: R2_BUCKET,
        Key: finalKey,
        CopySource: encodeURIComponent(`${R2_BUCKET}/${key}`),
        MetadataDirective: "REPLACE",
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
        ContentDisposition: "inline",
      }),
    );
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })).catch(() => {});
  } catch {
    return error("Gagal menyelesaikan upload gambar", 500);
  }

  return json({
    publicUrl: `${R2_PUBLIC_BASE_URL}/${finalKey}`,
    sizeBytes: size,
  });
}
