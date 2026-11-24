import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnalyzer } from "@/lib/analysis/anthropic-client";
import { checkCompany } from "@/lib/company/check";
import {
  checkRateLimitRpc,
  createBenchmarkRepository,
  createComparisonRepository,
  createProfileRepository,
  createReportRepository,
  createScanRepository,
} from "@/lib/db/supabase-repos";
import { getPublicEnv } from "@/lib/env";
import { apiError } from "@/lib/security/http";
import { getAuthAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient, getCurrentRole, getCurrentUser } from "@/lib/supabase/server";
import { inspectUrl } from "@/lib/url/inspect";
import type { HandlerContext } from "./context";

function log(event: string, details: Record<string, unknown>) {
  // Structured server log. Never includes request bodies or secrets.
  console.info(JSON.stringify({ level: "info", event, ...details, at: new Date().toISOString() }));
}

export function buildContext(client: SupabaseClient, user: { id: string; email: string | null } | null): HandlerContext {
  let adminCache: Promise<boolean> | null = null;
  const authAdmin = getAuthAdmin();
  return {
    user,
    isAdmin: () => (adminCache ??= user ? getCurrentRole(client, user.id).then((r) => r === "admin") : Promise.resolve(false)),
    rateLimit: (bucket, limit, windowSeconds) => checkRateLimitRpc(client, bucket, limit, windowSeconds),
    scans: createScanRepository(client),
    comparisons: createComparisonRepository(client),
    reports: createReportRepository(client),
    profiles: createProfileRepository(client),
    benchmarks: createBenchmarkRepository(client),
    analyzer: getAnalyzer(),
    inspectUrl: (url) => inspectUrl(url),
    checkCompany: (input) => checkCompany(input),
    deleteAuthUser: authAdmin ? (id) => authAdmin.deleteUser(id) : null,
    allowedOrigins: [getPublicEnv().siteUrl],
    now: () => new Date(),
    log,
  };
}

/** Build a request context from the session cookies and run the handler. */
export async function withContext(handler: (ctx: HandlerContext) => Promise<Response>): Promise<Response> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return apiError(503, "service_unavailable", "This server isn't connected to a database yet. See README → Supabase setup.");
  }
  const user = await getCurrentUser(client);
  return handler(buildContext(client, user ? { id: user.id, email: user.email ?? null } : null));
}

/** Context for public endpoints that need no database (e.g. the rules-only demo). */
export function publicContext(): HandlerContext {
  const unavailable = () => {
    throw new Error("Not available in public context");
  };
  const repo = new Proxy({}, { get: () => unavailable }) as never;
  return {
    user: null,
    isAdmin: async () => false,
    rateLimit: async () => false,
    scans: repo,
    comparisons: repo,
    reports: repo,
    profiles: repo,
    benchmarks: repo,
    analyzer: null,
    inspectUrl: unavailable,
    checkCompany: unavailable,
    deleteAuthUser: null,
    allowedOrigins: [getPublicEnv().siteUrl],
    now: () => new Date(),
    log,
  };
}
