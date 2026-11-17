import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/session";
import { getWritableMembership, hasOnlineAccess } from "@/lib/stores";
import { hasStoreOnlineAccess } from "@/lib/storeAccess";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByAccount, tooManyRequests } from "@/lib/rateLimit";
import {
  ALLOWED_SETTING_KEYS,
  MAX_ENTITY_BYTES,
  MAX_FUTURE_SKEW_MS,
  MAX_SYNC_ENTITIES,
  jsonByteSize,
  validateEntityData,
  type EntityKind,
} from "@/lib/syncPolicy";
import { SETTING_PERMISSION_MAP } from "@/lib/accessPolicy";

const KINDS = ["product", "category", "transaction", "member", "setting"] as const;

const bodySchema = z.object({
  storeId: z.string().min(1).max(191),
  entities: z
    .array(
      z.object({
        kind: z.enum(KINDS),
        clientId: z.string().min(1).max(191),
        updatedAt: z.number().int().nonnegative(),
        deleted: z.boolean().optional(),
        // Blob JSON opaque — divalidasi per-kind setelah ini.
        data: z.unknown().optional(),
      }),
    )
    .max(MAX_SYNC_ENTITIES),
});

export async function POST(request: NextRequest) {
  const account = await requireAccount(request);
  if (!account) return error("Belum login", 401);

  const limit = limitByAccount(account.id, "sync-push", 60, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await parseJsonBody(request, 1024 * 1024);
  if (!body.ok) return body.response;

  const parsed = bodySchema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  const { storeId, entities } = parsed.data;
  const membership = await getWritableMembership(account.id, storeId);
  if (!membership) {
    return error("Toko tidak ditemukan atau sedang ditangguhkan", 404);
  }
  if (!hasOnlineAccess(account) && !(await hasStoreOnlineAccess(storeId))) {
    return error("Sinkronisasi membutuhkan Langganan.", 403);
  }
  if (entities.length === 0) return json({ accepted: 0, skipped: 0 });

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { accessManagementEnabled: true },
  });
  const isOwner = membership.role === "OWNER";
  const permissionsEnabled = isOwner || Boolean(store?.accessManagementEnabled);
  const locked = new Set(membership.lockedFeatures ?? []);

  // Izin menu per karyawan ikut menentukan entity yang boleh dipush.
  // Tanpa manajemen akses, karyawan hanya boleh transaksi & member (poin).
  for (const entity of entities) {
    if (isOwner) continue;
    if (entity.kind === "transaction" || entity.kind === "member") continue;
    if (!permissionsEnabled) {
      return error("Hanya owner yang boleh mengubah data ini", 403);
    }
    if (entity.kind === "product" && !locked.has("products")) continue;
    if (entity.kind === "category" && !locked.has("categories")) continue;
    if (entity.kind === "setting") {
      const permission = SETTING_PERMISSION_MAP[entity.clientId];
      if (permission && !locked.has(permission)) continue;
    }
    return error("Karyawan tidak punya izin untuk mengubah data ini", 403);
  }

  // Kasir boleh membuat member baru / update poin, tapi tidak boleh
  // mengubah identitas member yang sudah ada atau menghapusnya.
  const now = Date.now();
  for (const entity of entities) {
    if (entity.updatedAt > now + MAX_FUTURE_SKEW_MS) {
      return error("updatedAt tidak valid", 422);
    }

    if (entity.kind === "setting") {
      if (!(ALLOWED_SETTING_KEYS as readonly string[]).includes(entity.clientId)) {
        return error(`Setting "${entity.clientId}" tidak diizinkan`, 422);
      }
    }

    // Kasir boleh membuat member baru / update poin, tapi tidak boleh
    // mengubah identitas member yang sudah ada atau menghapusnya.
    if (membership.role !== "OWNER" && entity.kind === "member") {
      if (entity.deleted) return error("Hanya owner yang boleh menghapus member", 403);

      const existingMember = await prisma.syncEntity.findUnique({
        where: {
          storeId_kind_clientId: { storeId, kind: "member", clientId: entity.clientId },
        },
        select: { data: true, deletedAt: true },
      });

      if (existingMember && !existingMember.deletedAt) {
        const previous = existingMember.data as Record<string, unknown>;
        const incoming = (entity.data ?? {}) as Record<string, unknown>;
        for (const field of ["name", "phone", "email"] as const) {
          if (JSON.stringify(previous[field]) !== JSON.stringify(incoming[field])) {
            return error(`Kasir tidak boleh mengubah ${field} member`, 403);
          }
        }
      }
    }

    if (!entity.deleted) {
      const data = entity.data ?? {};
      if (jsonByteSize(data) > MAX_ENTITY_BYTES) {
        return error(`Data entity "${entity.clientId}" terlalu besar`, 413);
      }
      const validation = validateEntityData(
        entity.kind as EntityKind,
        entity.clientId,
        data,
      );
      if (!validation.ok) return error(validation.message, 422);
    }
  }

  // Satu statement upsert untuk seluruh batch: konflik per (storeId, kind, clientId)
  // hanya menimpa bila updatedAt dari client lebih baru (last-write-wins).
  const values = entities.map((entity) => {
    const updatedAt = new Date(entity.updatedAt);
    return Prisma.sql`(
      ${randomUUID()},
      ${storeId},
      ${entity.kind},
      ${entity.clientId},
      ${JSON.stringify(entity.data ?? {})}::jsonb,
      ${updatedAt},
      ${entity.deleted ? updatedAt : null},
      NOW()
    )`;
  });

  const accepted = await prisma.$executeRaw`
    INSERT INTO "SyncEntity" ("id", "storeId", "kind", "clientId", "data", "updatedAt", "deletedAt", "syncedAt")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("storeId", "kind", "clientId")
    DO UPDATE SET
      "data" = EXCLUDED."data",
      "updatedAt" = EXCLUDED."updatedAt",
      "deletedAt" = EXCLUDED."deletedAt",
      "syncedAt" = NOW()
    WHERE "SyncEntity"."updatedAt" < EXCLUDED."updatedAt"
  `;

  return json({ accepted, skipped: entities.length - accepted });
}
