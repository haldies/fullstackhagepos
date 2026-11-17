import type { NextRequest } from "next/server";
import { revokeSession, SESSION_COOKIE } from "@/lib/session";
import { json } from "@/lib/http";

export async function POST(request: NextRequest) {
  const all = request.nextUrl.searchParams.get("all") === "1";
  await revokeSession(request, all);

  const response = json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
