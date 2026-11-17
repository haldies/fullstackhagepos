import { NextResponse, type NextRequest } from "next/server";

type Bucket = { count: number; resetAt: number };

// Safety net global sebelum route handler (termasuk request dengan token invalid
// yang tetap memicu query session ke database). Rate limit spesifik per akun
// tetap ada di masing-masing route.
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function clientIp(request: NextRequest) {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;

  // Jangan percaya x-forwarded-for di production: jika origin terekspos,
  // klien dapat mengubah header ini untuk melewati rate limit.
  if (process.env.NODE_ENV === "production") return "unknown";

  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const now = Date.now();
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  const key = clientIp(request);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return NextResponse.next();
  }

  if (bucket.count >= 600) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)) } },
    );
  }

  bucket.count += 1;
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
