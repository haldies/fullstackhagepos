import type { NextRequest } from "next/server";
import { error } from "./http";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

/**
 * Rate limit in-memory (sliding fixed window). Untuk deployment multi-instance,
 * tetap pasang rate limit di Cloudflare/Redis; ini lapisan pertahanan kedua.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true };
}

export function tooManyRequests(retryAfter: number) {
  return error("Terlalu banyak permintaan. Coba lagi nanti.", 429, {
    "Retry-After": String(retryAfter),
  });
}

/**
 * IP klien di belakang Cloudflare Tunnel. Hanya percaya header Cloudflare
 * (`cf-connecting-ip`); `x-forwarded-for` dipakai sebagai fallback.
 */
export function clientIp(request: NextRequest): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  // Jangan percaya x-forwarded-for di production: header itu dapat dipalsukan
  // jika origin diakses langsung tanpa melalui Cloudflare.
  if (process.env.NODE_ENV === "production") return "unknown";

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

export function limitByIp(
  request: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
) {
  return rateLimit(`ip:${scope}:${clientIp(request)}`, limit, windowMs);
}

export function limitByAccount(accountId: string, scope: string, limit: number, windowMs: number) {
  return rateLimit(`account:${scope}:${accountId}`, limit, windowMs);
}
