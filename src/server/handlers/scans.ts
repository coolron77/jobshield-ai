import { createHash } from "node:crypto";
import { analyzeJobPosting } from "@/lib/analysis/pipeline";
import { Errors, UUID_RE, apiError, json, readJson } from "@/lib/security/http";
import { CreateScanSchema, MAX_BODY_BYTES, ScanListQuerySchema } from "@/lib/validation";
import type { HandlerContext } from "../context";
import { enforceRateLimits, requireSameOrigin, requireUser, safely } from "../guard";

export const PAGE_SIZE = 20;

function deriveTitle(text: string, company: string | undefined, domain: string | null): string {
  const firstLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length >= 8);
  const base = firstLine ?? (company ? `Opportunity at ${company}` : domain ? `Listing on ${domain}` : "Untitled scan");
  return base.length > 90 ? `${base.slice(0, 87)}…` : base;
}

/** POST /api/scans — analyse a job posting and save the report. */
export function createScan(req: Request, ctx: HandlerContext): Promise<Response> {
  return safely(ctx, "createScan", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;

    const body = await readJson(req, CreateScanSchema, MAX_BODY_BYTES.scan);
    if (!body.ok) return body.response;
    const input = body.data;

    const limited = await enforceRateLimits(ctx, ["scan_burst", "scan_daily"]);
    if (limited) return limited;

    let url = null;
    let pageText: string | null = null;
    if (input.url) {
      const inspection = await ctx.inspectUrl(input.url);
      url = inspection.summary;
      pageText = inspection.pageText;
      if (!input.text && !pageText) {
        return apiError(422, "unprocessable", `We couldn't read that page (${inspection.summary.error ?? "no readable text"}). Paste the job description text instead.`, {
          fields: { url: inspection.summary.error ?? "Page could not be read." },
        });
      }
    }

    const text = input.text || "";
    const { report, analyzedText } = await analyzeJobPosting(
      { text, pageText, submittedUrl: input.url ?? null, companyName: input.company_name ?? null, url },
      ctx.analyzer,
      ctx.now(),
    );

    const profile = await ctx.profiles.get(auth.user.id);
    const storeText = profile?.store_scan_text ?? true;

    const saved = await ctx.scans.create({
      owner_id: auth.user.id,
      title: input.title ?? deriveTitle(analyzedText, input.company_name, url?.domain ?? null),
      input_text: storeText ? analyzedText : null,
      input_sha256: createHash("sha256").update(analyzedText).digest("hex"),
      submitted_url: url?.submitted_url ?? null,
      company_name: input.company_name ?? null,
      risk_score: report.risk_score,
      risk_level: report.risk_level,
      summary: report.summary.slice(0, 2000),
      analysis: report,
      analysis_mode: report.mode,
      model: report.model,
    });

    ctx.log("scan_created", { user: auth.user.id, scan: saved.id, mode: report.mode, level: report.risk_level });
    return json(201, { id: saved.id, risk_score: saved.risk_score, risk_level: saved.risk_level, mode: report.mode });
  });
}

/** GET /api/scans?q=&level=&page= */
export function listScans(req: Request, ctx: HandlerContext): Promise<Response> {
  return safely(ctx, "listScans", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const params = Object.fromEntries(new URL(req.url).searchParams);
    const parsed = ScanListQuerySchema.safeParse(params);
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid filters.");
    const { q, level, page } = parsed.data;
    const result = await ctx.scans.list({ ownerId: auth.user.id, q, level, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
    return json(200, { ...result, page, page_size: PAGE_SIZE });
  });
}

/** GET /api/scans/:id */
export function getScan(_req: Request, ctx: HandlerContext, id: string): Promise<Response> {
  return safely(ctx, "getScan", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    if (!UUID_RE.test(id)) return Errors.notFound("Scan");
    const scan = await ctx.scans.get(id, auth.user.id);
    // Same response whether the scan doesn't exist or belongs to someone else.
    return scan ? json(200, scan) : Errors.notFound("Scan");
  });
}

/** DELETE /api/scans/:id */
export function deleteScan(req: Request, ctx: HandlerContext, id: string): Promise<Response> {
  return safely(ctx, "deleteScan", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    if (!UUID_RE.test(id)) return Errors.notFound("Scan");
    const deleted = await ctx.scans.delete(id, auth.user.id);
    return deleted ? json(200, { deleted: true }) : Errors.notFound("Scan");
  });
}
