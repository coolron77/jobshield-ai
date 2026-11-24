import type { z } from "zod";

/**
 * Framework-neutral request/response helpers built on the standard Fetch API
 * Request/Response, so handlers run unchanged in Next.js route handlers and
 * in unit tests.
 */

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE, ...headers },
  });
}

export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "payload_too_large"
  | "unsupported_media_type"
  | "rate_limited"
  | "unprocessable"
  | "service_unavailable"
  | "internal_error";

export function apiError(status: number, code: ErrorCode, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return json(status, { error: { code, message, ...extra } }, headers);
}

export const Errors = {
  unauthenticated: () => apiError(401, "unauthenticated", "Please sign in to continue."),
  forbidden: (message = "You don't have permission to do that.") => apiError(403, "forbidden", message),
  notFound: (what = "Item") => apiError(404, "not_found", `${what} not found.`),
  rateLimited: (retryAfterSeconds: number) =>
    apiError(429, "rate_limited", "Too many requests. Please wait a moment and try again.", { retry_after_seconds: retryAfterSeconds }, { "Retry-After": String(retryAfterSeconds) }),
  tooLarge: (maxBytes: number) => apiError(413, "payload_too_large", `Request is too large (limit ${Math.round(maxBytes / 1024)} KB).`),
  internal: (requestId: string) => apiError(500, "internal_error", "Something went wrong on our side. Please try again.", { request_id: requestId }),
};

/**
 * CSRF defence for state-changing requests: the Origin (or, failing that,
 * Referer) must match the request's own host. Supabase auth cookies are also
 * SameSite=Lax, so this is defence in depth.
 */
export function isSameOrigin(req: Request, allowedOrigins: string[] = []): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const source = req.headers.get("origin") ?? req.headers.get("referer");
  if (!source) return false;
  let origin: URL;
  try {
    origin = new URL(source);
  } catch {
    return false;
  }
  if (host && origin.host === host) return true;
  return allowedOrigins.some((o) => {
    try {
      return new URL(o).origin === origin.origin;
    } catch {
      return false;
    }
  });
}

export type BodyResult<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Read a JSON body with a hard byte limit (header AND actual stream length). */
export async function readJson<T extends z.ZodTypeAny>(req: Request, schema: T, maxBytes: number): Promise<BodyResult<z.infer<T>>> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: apiError(415, "unsupported_media_type", "Expected a JSON request body.") };
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { ok: false, response: Errors.tooLarge(maxBytes) };

  let text = "";
  if (req.body) {
    const reader = req.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, response: Errors.tooLarge(maxBytes) };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }

  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, response: apiError(400, "invalid_request", "Request body is not valid JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fields[key]) fields[key] = issue.message;
    }
    return { ok: false, response: apiError(400, "invalid_request", "Please check the highlighted fields.", { fields }) };
  }
  return { ok: true, data: parsed.data };
}

export function requestId(): string {
  return crypto.randomUUID();
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
