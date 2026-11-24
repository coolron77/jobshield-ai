import { Errors, UUID_RE, apiError, json, readJson } from "@/lib/security/http";
import { CreateComparisonSchema, CreateReportSchema, FlagReportSchema, MAX_BODY_BYTES, ModerateSchema, ModerationQueueSchema } from "@/lib/validation";
import type { HandlerContext } from "../context";
import { enforceRateLimits, requireSameOrigin, requireUser, safely } from "../guard";

// ------------------------------------------------------------- comparisons

/** POST /api/comparisons — save a comparison of two of the user's scans. */
export function createComparison(req: Request, ctx: HandlerContext): Promise<Response> {
  return safely(ctx, "createComparison", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    const body = await readJson(req, CreateComparisonSchema, MAX_BODY_BYTES.small);
    if (!body.ok) return body.response;
    const { scan_a_id, scan_b_id, note } = body.data;
    // Ownership check in the app layer as well as RLS (defence in depth).
    const [a, b] = await Promise.all([ctx.scans.get(scan_a_id, auth.user.id), ctx.scans.get(scan_b_id, auth.user.id)]);
    if (!a || !b) return Errors.notFound("Scan");
    try {
      const row = await ctx.comparisons.create(auth.user.id, scan_a_id, scan_b_id, note ?? null);
      return json(201, row);
    } catch (e) {
      if (e instanceof Error && e.message === "duplicate") return apiError(409, "invalid_request", "You've already saved this comparison.");
      throw e;
    }
  });
}

/** DELETE /api/comparisons/:id */
export function deleteComparison(req: Request, ctx: HandlerContext, id: string): Promise<Response> {
  return safely(ctx, "deleteComparison", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    if (!UUID_RE.test(id)) return Errors.notFound("Comparison");
    return (await ctx.comparisons.delete(id, auth.user.id)) ? json(200, { deleted: true }) : Errors.notFound("Comparison");
  });
}

// ------------------------------------------------------------- community reports

/** POST /api/reports */
export function submitReport(req: Request, ctx: HandlerContext): Promise<Response> {
  return safely(ctx, "submitReport", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    const body = await readJson(req, CreateReportSchema, MAX_BODY_BYTES.small);
    if (!body.ok) return body.response;
    const limited = await enforceRateLimits(ctx, ["report_submit"]);
    if (limited) return limited;
    const { accept_guidelines: _accepted, scan_id, ...fields } = body.data;
    if (scan_id && !(await ctx.scans.get(scan_id, auth.user.id))) return Errors.notFound("Scan");
    const row = await ctx.reports.create(auth.user.id, {
      company_name: fields.company_name,
      opportunity_title: fields.opportunity_title ?? null,
      opportunity_url: fields.opportunity_url ?? null,
      contact_channel: fields.contact_channel ?? null,
      description: fields.description,
      evidence_excerpt: fields.evidence_excerpt ?? null,
      scan_id: scan_id ?? null,
    });
    return json(201, { id: row.id, moderation_status: row.moderation_status });
  });
}

/** POST /api/reports/:id/flag — report abuse. */
export function flagReport(req: Request, ctx: HandlerContext, id: string): Promise<Response> {
  return safely(ctx, "flagReport", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    if (!UUID_RE.test(id)) return Errors.notFound("Report");
    const body = await readJson(req, FlagReportSchema, MAX_BODY_BYTES.small);
    if (!body.ok) return body.response;
    const limited = await enforceRateLimits(ctx, ["report_flag"]);
    if (limited) return limited;
    const result = await ctx.reports.flag(id, auth.user.id, body.data.reason, body.data.details ?? null);
    if (result === "duplicate") return apiError(409, "invalid_request", "You've already flagged this report.");
    if (result === "not_allowed") return Errors.forbidden("This report can't be flagged.");
    return json(201, { flagged: true });
  });
}

/** DELETE /api/reports/:id — reporters can withdraw their own reports. */
export function deleteReport(req: Request, ctx: HandlerContext, id: string): Promise<Response> {
  return safely(ctx, "deleteReport", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    if (!UUID_RE.test(id)) return Errors.notFound("Report");
    return (await ctx.reports.delete(id, auth.user.id)) ? json(200, { deleted: true }) : Errors.notFound("Report");
  });
}

// ------------------------------------------------------------- admin

async function requireAdmin(ctx: HandlerContext): Promise<Response | null> {
  if (!ctx.user) return Errors.unauthenticated();
  // Authorisation is decided server-side from the database role; the
  // database functions re-check is_admin() independently.
  return (await ctx.isAdmin()) ? null : Errors.forbidden();
}

/** GET /api/admin/reports?status= */
export function moderationQueue(req: Request, ctx: HandlerContext): Promise<Response> {
  return safely(ctx, "moderationQueue", async () => {
    const denied = await requireAdmin(ctx);
    if (denied) return denied;
    const parsed = ModerationQueueSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid status filter.");
    return json(200, { items: await ctx.reports.listForModeration(parsed.data.status, 100) });
  });
}

/** POST /api/admin/reports/:id/moderate */
export function moderateReport(req: Request, ctx: HandlerContext, id: string): Promise<Response> {
  return safely(ctx, "moderateReport", async () => {
    const denied = await requireAdmin(ctx);
    if (denied) return denied;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    if (!UUID_RE.test(id)) return Errors.notFound("Report");
    const body = await readJson(req, ModerateSchema, MAX_BODY_BYTES.small);
    if (!body.ok) return body.response;
    const row = await ctx.reports.moderate(id, body.data.action, body.data.reason);
    ctx.log("report_moderated", { admin: ctx.user?.id, report: id, action: body.data.action });
    return json(200, { id: row.id, moderation_status: row.moderation_status });
  });
}

/** GET /api/admin/stats */
export function adminStats(_req: Request, ctx: HandlerContext): Promise<Response> {
  return safely(ctx, "adminStats", async () => {
    const denied = await requireAdmin(ctx);
    if (denied) return denied;
    const [stats, log] = await Promise.all([ctx.profiles.adminStats(), ctx.reports.moderationLog(25)]);
    return json(200, { stats, recent_actions: log });
  });
}
