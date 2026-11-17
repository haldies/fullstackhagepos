import { NextResponse } from "next/server";
import type { ZodError } from "zod";

const NO_STORE = "private, no-store, max-age=0, must-revalidate";

const applyHeaders = (response: NextResponse, headers?: Record<string, string>) => {
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
};

export const json = (data: unknown, status = 200, headers?: Record<string, string>) =>
  applyHeaders(NextResponse.json(data, { status }), headers);

export const error = (message: string, status = 400, headers?: Record<string, string>) =>
  applyHeaders(NextResponse.json({ error: message }, { status }), headers);

export const zodError = (err: ZodError) =>
  applyHeaders(
    NextResponse.json(
      {
        error: "Payload tidak valid",
        issues: err.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 422 },
    ),
  );

export const MAX_BODY_BYTES = 1024 * 1024;

type BodyResult =
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse };

/**
 * Baca body JSON dengan batas ukuran. Route handler Next.js tidak punya
 * limit body bawaan, jadi ini mencegah payload raksasa menghabiskan memori.
 */
export async function parseJsonBody(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: error("Payload terlalu besar", 413) };
  }

  let text = "";
  if (request.body) {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          await reader.cancel();
          return { ok: false, response: error("Payload terlalu besar", 413) };
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } catch {
      return { ok: false, response: error("Gagal membaca body", 400) };
    }
  }

  if (!text.trim()) {
    return { ok: false, response: error("Body JSON wajib diisi", 400) };
  }

  try {
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: error("JSON tidak valid", 400) };
  }
}
