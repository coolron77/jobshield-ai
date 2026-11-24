import type { SupabaseClient } from "@supabase/supabase-js";
import { ReportSchema, type RiskLevel } from "@/lib/analysis/schema";
import { BenchmarkSchema, type SalaryBenchmark } from "@/lib/salary/salary";
import {
  ForbiddenError,
  NotFoundError,
  type AdminStats,
  type BenchmarkRepository,
  type CommunityReportRow,
  type ComparisonRepository,
  type ModerationActionRow,
  type ProfileRepository,
  type ProfileRow,
  type PublicReport,
  type ReportRepository,
  type ScanListItem,
  type ScanRepository,
  type ScanRow,
} from "./types";

/**
 * Supabase-backed repositories. `client` must be the per-request server
 * client carrying the user's session, so every query runs under RLS.
 */

const SCAN_LIST_COLUMNS = "id,title,company_name,submitted_url,risk_score,risk_level,analysis_mode,created_at";
const REPORT_COLUMNS =
  "id,reporter_id,company_name,opportunity_title,opportunity_url,contact_channel,description,evidence_excerpt,scan_id,moderation_status,flag_count,created_at,moderated_at";

interface PgError {
  code?: string;
  message: string;
}

function fail(error: PgError, context: string): never {
  if (error.code === "42501") throw new ForbiddenError(`${context}: not permitted`);
  if (error.code === "P0002" || error.code === "PGRST116") throw new NotFoundError(`${context}: not found`);
  // Never forward raw database messages to clients; callers log + map to 500.
  throw new Error(`${context} failed (${error.code ?? "unknown"}): ${error.message}`);
}

/** Escape user search text for a PostgREST ilike filter. */
export function escapeIlike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()*"]/g, " ").trim().slice(0, 100);
}

function toScan(row: Record<string, unknown>): ScanRow {
  const parsed = ReportSchema.safeParse(row.analysis);
  if (!parsed.success) throw new Error("Stored analysis failed validation");
  return { ...(row as unknown as ScanRow), analysis: parsed.data };
}

export function createScanRepository(client: SupabaseClient): ScanRepository {
  return {
    async create(scan) {
      const { data, error } = await client.from("scans").insert(scan).select("*").single();
      if (error) fail(error, "Create scan");
      return toScan(data);
    },
    async list({ ownerId, q, level, limit, offset }) {
      let query = client.from("scans").select(SCAN_LIST_COLUMNS, { count: "exact" }).eq("owner_id", ownerId);
      if (level) query = query.eq("risk_level", level);
      if (q) {
        const term = escapeIlike(q);
        if (term) query = query.or(`title.ilike.%${term}%,company_name.ilike.%${term}%,submitted_url.ilike.%${term}%`);
      }
      const { data, error, count } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error) fail(error, "List scans");
      return { items: (data ?? []) as unknown as ScanListItem[], total: count ?? 0 };
    },
    async get(id, ownerId) {
      const { data, error } = await client.from("scans").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
      if (error) fail(error, "Get scan");
      return data ? toScan(data) : null;
    },
    async delete(id, ownerId) {
      const { data, error } = await client.from("scans").delete().eq("id", id).eq("owner_id", ownerId).select("id");
      if (error) fail(error, "Delete scan");
      return (data ?? []).length > 0;
    },
    async deleteAll(ownerId) {
      const { data, error } = await client.from("scans").delete().eq("owner_id", ownerId).select("id");
      if (error) fail(error, "Delete scans");
      return (data ?? []).length;
    },
    async stats(ownerId) {
      const levels: RiskLevel[] = ["low", "medium", "high", "critical"];
      const counts = await Promise.all(
        levels.map(async (level) => {
          const { count, error } = await client.from("scans").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("risk_level", level);
          if (error) fail(error, "Scan stats");
          return [level, count ?? 0] as const;
        }),
      );
      const { data, error } = await client.from("scans").select(SCAN_LIST_COLUMNS).eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(5);
      if (error) fail(error, "Recent scans");
      const byLevel = Object.fromEntries(counts) as Record<RiskLevel, number>;
      return { total: counts.reduce((s, [, n]) => s + n, 0), byLevel, recent: (data ?? []) as unknown as ScanListItem[] };
    },
    async exportAll(ownerId) {
      const { data, error } = await client.from("scans").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(5000);
      if (error) fail(error, "Export scans");
      return (data ?? []) as unknown as ScanRow[];
    },
  };
}

export function createComparisonRepository(client: SupabaseClient): ComparisonRepository {
  return {
    async create(ownerId, a, b, note) {
      const { data, error } = await client.from("saved_comparisons").insert({ owner_id: ownerId, scan_a_id: a, scan_b_id: b, note }).select("*").single();
      if (error) {
        if (error.code === "23505") throw new Error("duplicate");
        fail(error, "Save comparison");
      }
      return data;
    },
    async list(ownerId) {
      const { data, error } = await client
        .from("saved_comparisons")
        .select("id,owner_id,scan_a_id,scan_b_id,note,created_at,a:scans!saved_comparisons_scan_a_id_fkey(title),b:scans!saved_comparisons_scan_b_id_fkey(title)")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) fail(error, "List comparisons");
      return (data ?? []).map((row: Record<string, unknown>) => {
        const r = row as unknown as Record<string, unknown> & { a?: { title?: string } | null; b?: { title?: string } | null };
        return {
          id: String(r.id),
          owner_id: String(r.owner_id),
          scan_a_id: String(r.scan_a_id),
          scan_b_id: String(r.scan_b_id),
          note: (r.note as string | null) ?? null,
          created_at: String(r.created_at),
          scan_a_title: r.a?.title ?? null,
          scan_b_title: r.b?.title ?? null,
        };
      });
    },
    async delete(id, ownerId) {
      const { data, error } = await client.from("saved_comparisons").delete().eq("id", id).eq("owner_id", ownerId).select("id");
      if (error) fail(error, "Delete comparison");
      return (data ?? []).length > 0;
    },
  };
}

export function createReportRepository(client: SupabaseClient): ReportRepository {
  return {
    async create(_reporterId, report) {
      // reporter_id and moderation_status come from database defaults.
      const { data, error } = await client.from("community_reports").insert(report).select(REPORT_COLUMNS).single();
      if (error) fail(error, "Submit report");
      return data as unknown as CommunityReportRow;
    },
    async listPublic({ q, limit, offset }) {
      let query = client.from("public_community_reports").select("*", { count: "exact" });
      if (q) {
        const term = escapeIlike(q);
        if (term) query = query.or(`company_name.ilike.%${term}%,opportunity_title.ilike.%${term}%`);
      }
      const { data, error, count } = await query.order("moderated_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error) fail(error, "List reports");
      return { items: (data ?? []) as unknown as PublicReport[], total: count ?? 0 };
    },
    async listMine(reporterId) {
      const { data, error } = await client.from("community_reports").select(REPORT_COLUMNS).eq("reporter_id", reporterId).order("created_at", { ascending: false }).limit(200);
      if (error) fail(error, "List my reports");
      return (data ?? []) as unknown as CommunityReportRow[];
    },
    async delete(id, reporterId) {
      const { data, error } = await client.from("community_reports").delete().eq("id", id).eq("reporter_id", reporterId).select("id");
      if (error) fail(error, "Delete report");
      return (data ?? []).length > 0;
    },
    async deleteAllMine(reporterId) {
      const { data, error } = await client.from("community_reports").delete().eq("reporter_id", reporterId).select("id");
      if (error) fail(error, "Delete reports");
      return (data ?? []).length;
    },
    async flag(reportId, _userId, reason, details) {
      const { error } = await client.from("report_flags").insert({ report_id: reportId, reason, details });
      if (!error) return "ok";
      if (error.code === "23505") return "duplicate";
      if (error.code === "42501" || error.code === "23503") return "not_allowed";
      fail(error, "Flag report");
    },
    async listForModeration(status, limit) {
      let query = client.from("community_reports").select(REPORT_COLUMNS);
      query = status === "flagged" ? query.gt("flag_count", 0) : query.eq("moderation_status", status);
      const { data, error } = await query.order("created_at", { ascending: true }).limit(limit);
      if (error) fail(error, "Moderation queue");
      return (data ?? []) as unknown as CommunityReportRow[];
    },
    async moderate(reportId, action, reason) {
      const { data, error } = await client.rpc("moderate_report", { p_report_id: reportId, p_action: action, p_reason: reason });
      if (error) fail(error, "Moderate report");
      return data as unknown as CommunityReportRow;
    },
    async moderationLog(limit) {
      const { data, error } = await client.from("moderation_actions").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) fail(error, "Moderation log");
      return (data ?? []) as unknown as ModerationActionRow[];
    },
  };
}

export function createProfileRepository(client: SupabaseClient): ProfileRepository {
  return {
    async get(userId) {
      const { data, error } = await client.from("profiles").select("id,display_name,role,store_scan_text,created_at").eq("id", userId).maybeSingle();
      if (error) fail(error, "Get profile");
      return (data as ProfileRow | null) ?? null;
    },
    async update(userId, patch) {
      const { data, error } = await client.from("profiles").update(patch).eq("id", userId).select("id,display_name,role,store_scan_text,created_at").single();
      if (error) fail(error, "Update profile");
      return data as ProfileRow;
    },
    async adminStats() {
      const { data, error } = await client.rpc("admin_stats");
      if (error) fail(error, "Admin stats");
      return data as AdminStats;
    },
  };
}

export function createBenchmarkRepository(client: SupabaseClient): BenchmarkRepository {
  return {
    async list() {
      const { data, error } = await client.from("salary_benchmarks").select("*").limit(1000);
      if (error) fail(error, "Salary benchmarks");
      return (data ?? []).flatMap((row: Record<string, unknown>) => {
        const parsed = BenchmarkSchema.safeParse({ ...row, min_amount: Number(row.min_amount), max_amount: Number(row.max_amount) });
        return parsed.success ? [parsed.data] : [];
      }) as SalaryBenchmark[];
    },
  };
}

export async function checkRateLimitRpc(client: SupabaseClient, bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await client.rpc("check_rate_limit", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) fail(error, "Rate limit");
  return data === true;
}
