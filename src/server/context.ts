import type { AiAnalyzer } from "@/lib/analysis/ai";
import type { CompanyCheckInput, CompanyCheckResult } from "@/lib/company/check";
import type { BenchmarkRepository, ComparisonRepository, ProfileRepository, ReportRepository, ScanRepository } from "@/lib/db/types";
import type { UrlInspection } from "@/lib/url/inspect";

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * Everything a handler needs, injected per request. In production this is
 * built from the user's Supabase session (src/server/next-context.ts); in tests
 * from in-memory fakes.
 */
export interface HandlerContext {
  user: AuthUser | null;
  /** Server-side role check (reads profiles.role, never client input). */
  isAdmin(): Promise<boolean>;
  /** Shared, database-backed limiter. Returns true when allowed. */
  rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean>;
  scans: ScanRepository;
  comparisons: ComparisonRepository;
  reports: ReportRepository;
  profiles: ProfileRepository;
  benchmarks: BenchmarkRepository;
  analyzer: AiAnalyzer | null;
  inspectUrl(url: string): Promise<UrlInspection>;
  checkCompany(input: CompanyCheckInput): Promise<CompanyCheckResult>;
  /** Present only when the service-role key is configured. */
  deleteAuthUser: ((userId: string) => Promise<void>) | null;
  allowedOrigins: string[];
  now(): Date;
  log(event: string, details: Record<string, unknown>): void;
}

/** Documented limits for expensive routes. [limit, windowSeconds] */
export const RATE_LIMITS = {
  scan_burst: [10, 600],
  scan_daily: [60, 86_400],
  url_check: [20, 600],
  company_check: [15, 600],
  tool: [60, 600],
  report_submit: [5, 3600],
  report_flag: [20, 3600],
  export: [10, 3600],
} as const satisfies Record<string, readonly [number, number]>;
