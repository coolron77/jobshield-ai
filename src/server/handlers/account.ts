import { apiError, json, readJson } from "@/lib/security/http";
import { DeleteAccountSchema, MAX_BODY_BYTES, UpdateProfileSchema } from "@/lib/validation";
import type { HandlerContext } from "../context";
import { enforceRateLimits, requireSameOrigin, requireUser, safely } from "../guard";

/** PATCH /api/account — display name and privacy settings. */
export function updateProfile(req: Request, ctx: HandlerContext): Promise<Response> {
  return safely(ctx, "updateProfile", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    const body = await readJson(req, UpdateProfileSchema, MAX_BODY_BYTES.small);
    if (!body.ok) return body.response;
    const patch: { display_name?: string | null; store_scan_text?: boolean } = {};
    if (body.data.display_name !== undefined) patch.display_name = body.data.display_name || null;
    if (body.data.store_scan_text !== undefined) patch.store_scan_text = body.data.store_scan_text;
    const profile = await ctx.profiles.update(auth.user.id, patch);
    return json(200, { display_name: profile.display_name, store_scan_text: profile.store_scan_text });
  });
}

/** GET /api/account/export — everything we hold about the user, as JSON. */
export function exportData(_req: Request, ctx: HandlerContext): Promise<Response> {
  return safely(ctx, "exportData", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const limited = await enforceRateLimits(ctx, ["export"]);
    if (limited) return limited;
    const [profile, scans, comparisons, reports] = await Promise.all([
      ctx.profiles.get(auth.user.id),
      ctx.scans.exportAll(auth.user.id),
      ctx.comparisons.list(auth.user.id),
      ctx.reports.listMine(auth.user.id),
    ]);
    const payload = {
      exported_at: ctx.now().toISOString(),
      account: { id: auth.user.id, email: auth.user.email },
      profile,
      scans,
      saved_comparisons: comparisons,
      community_reports: reports,
    };
    return json(200, payload, { "Content-Disposition": `attachment; filename="jobshield-export-${ctx.now().toISOString().slice(0, 10)}.json"` });
  });
}

/**
 * DELETE /api/account  { scope: "data" | "account", confirm: "DELETE" }
 *  - data:    deletes all scans, comparisons and community reports.
 *  - account: the above, then deletes the auth user (requires the
 *             service-role key; all remaining rows cascade).
 */
export function deleteAccount(req: Request, ctx: HandlerContext): Promise<Response> {
  return safely(ctx, "deleteAccount", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    const body = await readJson(req, DeleteAccountSchema, MAX_BODY_BYTES.small);
    if (!body.ok) return body.response;

    if (body.data.scope === "account" && !ctx.deleteAuthUser) {
      return apiError(503, "service_unavailable", "Account deletion isn't configured on this server yet. You can still delete all of your data, or contact the administrator.");
    }

    // Comparisons cascade from scans; reports are deleted explicitly so nothing
    // the user wrote remains after deletion.
    const reports = await ctx.reports.deleteAllMine(auth.user.id);
    const scans = await ctx.scans.deleteAll(auth.user.id);

    if (body.data.scope === "account" && ctx.deleteAuthUser) {
      await ctx.deleteAuthUser(auth.user.id);
      ctx.log("account_deleted", { user: auth.user.id });
      return json(200, { deleted: "account", scans, reports });
    }
    ctx.log("data_deleted", { user: auth.user.id, scans, reports });
    return json(200, { deleted: "data", scans, reports });
  });
}
