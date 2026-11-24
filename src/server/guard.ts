import { Errors, isSameOrigin, requestId } from "@/lib/security/http";
import { ForbiddenError, NotFoundError } from "@/lib/db/types";
import type { AuthUser, HandlerContext } from "./context";
import { RATE_LIMITS } from "./context";

/** Wrap a handler: never leak stack traces or internal messages. */
export async function safely(ctx: HandlerContext, name: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ForbiddenError) return Errors.forbidden();
    if (err instanceof NotFoundError) return Errors.notFound();
    const id = requestId();
    ctx.log("handler_error", { handler: name, request_id: id, error: err instanceof Error ? err.message : String(err) });
    return Errors.internal(id);
  }
}

export function requireUser(ctx: HandlerContext): { user: AuthUser } | { response: Response } {
  return ctx.user ? { user: ctx.user } : { response: Errors.unauthenticated() };
}

export function requireSameOrigin(req: Request, ctx: HandlerContext): Response | null {
  return isSameOrigin(req, ctx.allowedOrigins) ? null : Errors.forbidden("Cross-site request rejected.");
}

export async function enforceRateLimits(ctx: HandlerContext, buckets: (keyof typeof RATE_LIMITS)[]): Promise<Response | null> {
  for (const bucket of buckets) {
    const [limit, window] = RATE_LIMITS[bucket];
    if (!(await ctx.rateLimit(bucket, limit, window))) {
      ctx.log("rate_limited", { bucket, user: ctx.user?.id });
      return Errors.rateLimited(Math.min(window, 600));
    }
  }
  return null;
}
