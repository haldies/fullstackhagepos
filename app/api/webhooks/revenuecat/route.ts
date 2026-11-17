import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { error, json, parseJsonBody, zodError } from "@/lib/http";
import { limitByIp, tooManyRequests } from "@/lib/rateLimit";
import { entitlementId, onlineEntitlementId } from "@/lib/revenuecat";

const ACTIVE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);

const eventSchema = z.object({
  event: z.object({
    type: z.string(),
    app_user_id: z.string().max(320).optional(),
    entitlement_id: z.string().max(120).nullable().optional(),
    entitlement_ids: z.array(z.string().max(120)).max(20).optional(),
    expiration_at_ms: z.number().int().nullable().optional(),
  }),
});

function secretMatches(header: string | null, secret: string) {
  const given = (header ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!given || given.length !== secret.length) return false;
  try {
    return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  } catch {
    return false;
  }
}

type EntitlementUpdate = {
  activeField: "proActive" | "onlineActive";
  expiresField: "proExpiresAt" | "onlineExpiresAt";
  checkedField: "proCheckedAt" | "onlineCheckedAt";
};

export async function POST(request: NextRequest) {
  const limit = limitByIp(request, "revenuecat-webhook", 120, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) return error("Webhook RevenueCat belum dikonfigurasi", 503);
  if (!secretMatches(request.headers.get("authorization"), secret)) {
    return error("Unauthorized", 401);
  }

  const body = await parseJsonBody(request, 64 * 1024);
  if (!body.ok) return body.response;

  const parsed = eventSchema.safeParse(body.body);
  if (!parsed.success) return zodError(parsed.error);

  const event = parsed.data.event;
  if (event.type === "TEST") return json({ ok: true, ignored: true });

  const ids = event.entitlement_ids?.length
    ? event.entitlement_ids
    : event.entitlement_id
      ? [event.entitlement_id]
      : [];

  const targets: EntitlementUpdate[] = [];
  if (ids.includes(entitlementId)) {
    targets.push({
      activeField: "proActive",
      expiresField: "proExpiresAt",
      checkedField: "proCheckedAt",
    });
  }
  if (ids.includes(onlineEntitlementId)) {
    targets.push({
      activeField: "onlineActive",
      expiresField: "onlineExpiresAt",
      checkedField: "onlineCheckedAt",
    });
  }

  if (targets.length === 0) return json({ ok: true, ignored: true });

  const email = event.app_user_id?.trim().toLowerCase();
  if (!email) return json({ ok: true, ignored: true });

  const expiresAt =
    typeof event.expiration_at_ms === "number" ? new Date(event.expiration_at_ms) : null;
  const now = new Date();

  const data: Record<string, boolean | Date | null> = {};

  for (const target of targets) {
    if (ACTIVE_EVENTS.has(event.type)) {
      data[target.activeField] = true;
      data[target.expiresField] = expiresAt;
      data[target.checkedField] = now;
    } else if (event.type === "EXPIRATION") {
      data[target.activeField] = false;
      data[target.expiresField] = expiresAt;
      data[target.checkedField] = now;
    } else if (event.type === "CANCELLATION") {
      // Tetap aktif sampai masa berlaku habis.
      data[target.expiresField] = expiresAt;
      data[target.checkedField] = now;
    } else if (event.type === "BILLING_ISSUE") {
      // RevenueCat masih memberi grace period.
      data[target.checkedField] = now;
    }
  }

  if (Object.keys(data).length === 0) return json({ ok: true, ignored: true });

  const updated = await prisma.account.updateMany({
    where: { email },
    data,
  });

  return json({ ok: true, matched: updated.count });
}
