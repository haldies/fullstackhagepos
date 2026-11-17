import { z } from "zod";

export const ALLOWED_SETTING_KEYS = [
  "storeProfile",
  "receiptSettings",
  "cartSettings",
  "inventorySettings",
] as const;

export type AllowedSettingKey = (typeof ALLOWED_SETTING_KEYS)[number];

export const OWNER_ONLY_KINDS = ["product", "category", "setting"] as const;

export const MAX_SYNC_ENTITIES = 200;
export const MAX_ENTITY_BYTES = 64 * 1024;
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

const objectData = z.record(z.string(), z.unknown());

const productSchema = z
  .object({
    id: z.string().min(1).max(191),
    name: z.string().min(1).max(200),
    price: z.number().finite(),
    stock: z.number().finite().optional(),
  })
  .passthrough();

const categorySchema = z
  .object({
    categories: z.array(z.string().max(100)).max(1000),
  })
  .passthrough();

const transactionSchema = z
  .object({
    id: z.string().min(1).max(191),
    date: z.number().finite(),
    items: z.array(z.record(z.string(), z.unknown())).max(1000),
    total: z.number().finite().optional(),
    totalCost: z.number().finite().optional(),
    status: z.string().max(30).optional(),
  })
  .passthrough();

const memberSchema = z
  .object({
    id: z.string().min(1).max(191),
    name: z.string().min(1).max(200),
    phone: z.string().max(50).optional(),
  })
  .passthrough();

const settingSchemas: Record<AllowedSettingKey, z.ZodTypeAny> = {
  // Nama toko wajib; field lain dibiarkan longgar agar kompatibel dengan versi app lama.
  storeProfile: z.object({ name: z.string().min(1).max(200) }).passthrough(),
  receiptSettings: z.object({}).passthrough(),
  cartSettings: z.object({}).passthrough(),
  inventorySettings: z.object({}).passthrough(),
};

export type EntityKind = "product" | "category" | "transaction" | "member" | "setting";

export type DataValidation =
  | { ok: true }
  | { ok: false; message: string };

export function validateEntityData(
  kind: EntityKind,
  clientId: string,
  data: unknown,
): DataValidation {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, message: "data harus berupa object" };
  }

  if (kind === "setting") {
    if (!(ALLOWED_SETTING_KEYS as readonly string[]).includes(clientId)) {
      return { ok: false, message: `Setting "${clientId}" tidak diizinkan untuk disinkronkan` };
    }
    const schema = settingSchemas[clientId as AllowedSettingKey];
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, message: `Data setting "${clientId}" tidak valid` };
    }
    return { ok: true };
  }

  const schema =
    kind === "product"
      ? productSchema
      : kind === "category"
        ? categorySchema
        : kind === "transaction"
          ? transactionSchema
          : memberSchema;

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, message: `Data ${kind} tidak valid` };
  }
  return { ok: true };
}

export function jsonByteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value ?? {})).length;
}

export { objectData };
