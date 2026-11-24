import type { Report, RiskLevel, AnalysisMode } from "@/lib/analysis/schema";
import type { SalaryBenchmark } from "@/lib/salary/salary";

/**
 * Repository interfaces. The Supabase implementations use the caller's own
 * session, so Row Level Security is enforced by the database; handlers still
 * pass the owner id explicitly as defence in depth.
 */

export interface ScanRow {
  id: string;
  owner_id: string;
  title: string;
  input_text: string | null;
  input_sha256: string;
  submitted_url: string | null;
  company_name: string | null;
  risk_score: number;
  risk_level: RiskLevel;
  summary: string;
  analysis: Report;
  analysis_mode: AnalysisMode;
  model: string | null;
  created_at: string;
}

export type ScanListItem = Pick<ScanRow, "id" | "title" | "company_name" | "submitted_url" | "risk_score" | "risk_level" | "analysis_mode" | "created_at">;
export type NewScan = Omit<ScanRow, "id" | "created_at">;

export interface ScanListQuery {
  ownerId: string;
  q?: string;
  level?: RiskLevel;
  limit: number;
  offset: number;
}

export interface ScanRepository {
  create(scan: NewScan): Promise<ScanRow>;
  list(query: ScanListQuery): Promise<{ items: ScanListItem[]; total: number }>;
  get(id: string, ownerId: string): Promise<ScanRow | null>;
  delete(id: string, ownerId: string): Promise<boolean>;
  deleteAll(ownerId: string): Promise<number>;
  stats(ownerId: string): Promise<{ total: number; byLevel: Record<RiskLevel, number>; recent: ScanListItem[] }>;
  exportAll(ownerId: string): Promise<ScanRow[]>;
}

export interface ComparisonRow {
  id: string;
  owner_id: string;
  scan_a_id: string;
  scan_b_id: string;
  note: string | null;
  created_at: string;
}

export interface ComparisonRepository {
  create(ownerId: string, a: string, b: string, note: string | null): Promise<ComparisonRow>;
  list(ownerId: string): Promise<(ComparisonRow & { scan_a_title: string | null; scan_b_title: string | null })[]>;
  delete(id: string, ownerId: string): Promise<boolean>;
}

export const MODERATION_STATUSES = ["pending", "approved", "rejected", "removed"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];
export const MODERATION_ACTIONS = ["approve", "reject", "remove", "requeue"] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];
export const FLAG_REASONS = ["inaccurate", "personal_information", "harassment", "spam", "other"] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export interface CommunityReportRow {
  id: string;
  reporter_id: string | null;
  company_name: string;
  opportunity_title: string | null;
  opportunity_url: string | null;
  contact_channel: string | null;
  description: string;
  evidence_excerpt: string | null;
  scan_id: string | null;
  moderation_status: ModerationStatus;
  flag_count: number;
  created_at: string;
  moderated_at: string | null;
}

export type PublicReport = Pick<
  CommunityReportRow,
  "id" | "company_name" | "opportunity_title" | "opportunity_url" | "contact_channel" | "description" | "evidence_excerpt" | "created_at" | "moderated_at"
>;

export type NewCommunityReport = Pick<CommunityReportRow, "company_name" | "opportunity_title" | "opportunity_url" | "contact_channel" | "description" | "evidence_excerpt" | "scan_id">;

export interface ModerationActionRow {
  id: string;
  admin_id: string | null;
  report_id: string;
  action: string;
  previous_status: string;
  new_status: string;
  reason: string;
  created_at: string;
}

export interface ReportRepository {
  create(reporterId: string, report: NewCommunityReport): Promise<CommunityReportRow>;
  listPublic(query: { q?: string; limit: number; offset: number }): Promise<{ items: PublicReport[]; total: number }>;
  listMine(reporterId: string): Promise<CommunityReportRow[]>;
  delete(id: string, reporterId: string): Promise<boolean>;
  deleteAllMine(reporterId: string): Promise<number>;
  flag(reportId: string, userId: string, reason: FlagReason, details: string | null): Promise<"ok" | "duplicate" | "not_allowed">;
  // Admin (authorised by the database via is_admin()):
  listForModeration(status: ModerationStatus | "flagged", limit: number): Promise<CommunityReportRow[]>;
  moderate(reportId: string, action: ModerationAction, reason: string): Promise<CommunityReportRow>;
  moderationLog(limit: number): Promise<ModerationActionRow[]>;
}

export interface ProfileRow {
  id: string;
  display_name: string | null;
  role: "user" | "admin";
  store_scan_text: boolean;
  created_at: string;
}

export interface AdminStats {
  total_users: number;
  total_scans: number;
  scans_last_7_days: number;
  scans_by_level: Partial<Record<RiskLevel, number>>;
  scans_by_mode: Partial<Record<AnalysisMode, number>>;
  reports_by_status: Partial<Record<ModerationStatus, number>>;
  flagged_reports: number;
}

export interface ProfileRepository {
  get(userId: string): Promise<ProfileRow | null>;
  update(userId: string, patch: { display_name?: string | null; store_scan_text?: boolean }): Promise<ProfileRow>;
  adminStats(): Promise<AdminStats>;
}

export interface BenchmarkRepository {
  list(): Promise<SalaryBenchmark[]>;
}

/** Thrown by repositories when the database denies an operation. */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
