import { z } from "zod";
import { analyzeJobPosting, INPUT_LIMITS } from "@/lib/analysis/pipeline";
import { detectPaymentRequests } from "@/lib/analysis/payment";
import { CompanyCheckInputSchema } from "@/lib/company/check";
import { checkSalary, SalaryCheckInputSchema } from "@/lib/salary/salary";
import { Errors, clientIp, json, readJson } from "@/lib/security/http";
import { MemoryRateLimiter } from "@/lib/security/memory-rate-limit";
import { MAX_BODY_BYTES, PaymentCheckSchema, UrlCheckSchema, cleanText } from "@/lib/validation";
import type { HandlerContext } from "../context";
import { enforceRateLimits, requireSameOrigin, requireUser, safely } from "../guard";

/** POST /api/tools/url — safe link inspection. */
export function urlCheck(req: Request, ctx: HandlerContext): Promise<Response> {
  return safely(ctx, "urlCheck", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    const body = await readJson(req, UrlCheckSchema, MAX_BODY_BYTES.small);
    if (!body.ok) return body.response;
    const limited = await enforceRateLimits(ctx, ["url_check"]);
    if (limited) return limited;
    const result = await ctx.inspectUrl(body.data.url);
    // Page text is returned so the user can choose to run a full scan on it.
    return json(200, result);
  });
}

/** POST /api/tools/company */
export function companyCheck(req: Request, ctx: HandlerContext): Promise<Response> {
  return safely(ctx, "companyCheck", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    const body = await readJson(req, CompanyCheckInputSchema, MAX_BODY_BYTES.small);
    if (!body.ok) return body.response;
    const limited = await enforceRateLimits(ctx, ["company_check"]);
    if (limited) return limited;
    return json(200, await ctx.checkCompany(body.data));
  });
}

/** POST /api/tools/salary */
export function salaryCheck(req: Request, ctx: HandlerContext): Promise<Response> {
  return safely(ctx, "salaryCheck", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    const body = await readJson(req, SalaryCheckInputSchema, MAX_BODY_BYTES.tool);
    if (!body.ok) return body.response;
    const limited = await enforceRateLimits(ctx, ["tool"]);
    if (limited) return limited;
    const benchmarks = await ctx.benchmarks.list();
    return json(200, checkSalary({ ...body.data, text: cleanText(body.data.text ?? "") }, benchmarks));
  });
}

/** POST /api/tools/payment */
export function paymentCheck(req: Request, ctx: HandlerContext): Promise<Response> {
  return safely(ctx, "paymentCheck", async () => {
    const auth = requireUser(ctx);
    if ("response" in auth) return auth.response;
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    const body = await readJson(req, PaymentCheckSchema, MAX_BODY_BYTES.tool);
    if (!body.ok) return body.response;
    const limited = await enforceRateLimits(ctx, ["tool"]);
    if (limited) return limited;
    return json(200, detectPaymentRequests(body.data.text));
  });
}

// ---------------------------------------------------------------------------
// Public demo: rules-only, never calls Claude, never stores anything.
// ---------------------------------------------------------------------------
const DemoSchema = z.object({
  text: z.string().trim().min(INPUT_LIMITS.minChars, `Paste at least ${INPUT_LIMITS.minChars} characters.`).max(INPUT_LIMITS.maxChars).transform(cleanText),
});
const demoLimiter = new MemoryRateLimiter(20, 10 * 60 * 1000);

/** POST /api/demo/scan */
export function demoScan(req: Request, ctx: HandlerContext, limiter: MemoryRateLimiter = demoLimiter): Promise<Response> {
  return safely(ctx, "demoScan", async () => {
    const csrf = requireSameOrigin(req, ctx);
    if (csrf) return csrf;
    const wait = limiter.check(clientIp(req));
    if (wait > 0) return Errors.rateLimited(wait);
    const body = await readJson(req, DemoSchema, MAX_BODY_BYTES.scan);
    if (!body.ok) return body.response;
    const { report, analyzedText } = await analyzeJobPosting({ text: body.data.text }, null, ctx.now());
    return json(200, { report, analyzed_text: analyzedText });
  });
}
