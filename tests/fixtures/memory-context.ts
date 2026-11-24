import { randomUUID } from "node:crypto";
import type { HandlerContext } from "@/server/context";
import { ForbiddenError, NotFoundError } from "@/lib/db/types";
import type {
  CommunityReportRow,
  ComparisonRow,
  ModerationActionRow,
  ProfileRow,
  ScanRow,
} from "@/lib/db/types";
import { createMockAnalyzer } from "@/lib/analysis/mock-ai";
import type { UrlInspection } from "@/lib/url/inspect";

/**
 * In-memory implementation of the repositories that mirrors the database's
 * RLS rules (owner-only scans/comparisons, reporter-or-admin reports,
 * approved-only public view, admin-only moderation).
 */
export interface MemoryDb {
  scans: ScanRow[];
  comparisons: ComparisonRow[];
  reports: CommunityReportRow[];
  flags: { report_id: string; flagger_id: string }[];
  actions: ModerationActionRow[];
  profiles: Map<string, ProfileRow>;
  rate: Map<string, number>;
  logs: { event: string; details: Record<string, unknown> }[];
}

export function createDb(): MemoryDb {
  return { scans: [], comparisons: [], reports: [], flags: [], actions: [], profiles: new Map(), rate: new Map(), logs: [] };
}

export const ORIGIN = "http://localhost:3000";

export function makeContext(db: MemoryDb, userId: string | null, opts: Partial<HandlerContext> & { rateLimitMax?: number } = {}): HandlerContext {
  const user = userId ? { id: userId, email: `${userId}@test.local` } : null;
  if (userId && !db.profiles.has(userId)) {
    db.profiles.set(userId, { id: userId, display_name: null, role: "user", store_scan_text: true, created_at: new Date().toISOString() });
  }
  const isAdmin = () => Boolean(userId && db.profiles.get(userId)?.role === "admin");
  const forbidden = () => new ForbiddenError();

  const ctx: HandlerContext = {
    user,
    isAdmin: async () => isAdmin(),
    rateLimit: async (bucket, limit) => {
      const key = `${bucket}:${userId}`;
      const n = (db.rate.get(key) ?? 0) + 1;
      db.rate.set(key, n);
      return n <= Math.min(limit, opts.rateLimitMax ?? limit);
    },
    scans: {
      async create(scan) {
        const row = { ...scan, id: randomUUID(), created_at: new Date().toISOString() } as ScanRow;
        db.scans.push(row);
        return row;
      },
      async list({ ownerId, q, level, limit, offset }) {
        let items = db.scans.filter((s) => s.owner_id === ownerId && s.owner_id === userId);
        if (level) items = items.filter((s) => s.risk_level === level);
        if (q) items = items.filter((s) => `${s.title} ${s.company_name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
        return { items: items.slice(offset, offset + limit), total: items.length };
      },
      async get(id, ownerId) {
        return db.scans.find((s) => s.id === id && s.owner_id === ownerId && s.owner_id === userId) ?? null;
      },
      async delete(id, ownerId) {
        const i = db.scans.findIndex((s) => s.id === id && s.owner_id === ownerId && s.owner_id === userId);
        if (i === -1) return false;
        db.scans.splice(i, 1);
        db.comparisons = db.comparisons.filter((c) => c.scan_a_id !== id && c.scan_b_id !== id);
        return true;
      },
      async deleteAll(ownerId) {
        const before = db.scans.length;
        db.scans = db.scans.filter((s) => s.owner_id !== ownerId);
        db.comparisons = db.comparisons.filter((c) => c.owner_id !== ownerId);
        return before - db.scans.length;
      },
      async stats(ownerId) {
        const mine = db.scans.filter((s) => s.owner_id === ownerId);
        const byLevel = { low: 0, medium: 0, high: 0, critical: 0 };
        for (const s of mine) byLevel[s.risk_level]++;
        return { total: mine.length, byLevel, recent: mine.slice(0, 5) };
      },
      async exportAll(ownerId) {
        return db.scans.filter((s) => s.owner_id === ownerId);
      },
    },
    comparisons: {
      async create(ownerId, a, b, note) {
        const owns = (id: string) => db.scans.some((s) => s.id === id && s.owner_id === ownerId);
        if (!owns(a) || !owns(b)) throw forbidden();
        if (db.comparisons.some((c) => c.owner_id === ownerId && c.scan_a_id === a && c.scan_b_id === b)) throw new Error("duplicate");
        const row = { id: randomUUID(), owner_id: ownerId, scan_a_id: a, scan_b_id: b, note, created_at: new Date().toISOString() };
        db.comparisons.push(row);
        return row;
      },
      async list(ownerId) {
        return db.comparisons.filter((c) => c.owner_id === ownerId).map((c) => ({ ...c, scan_a_title: null, scan_b_title: null }));
      },
      async delete(id, ownerId) {
        const i = db.comparisons.findIndex((c) => c.id === id && c.owner_id === ownerId);
        if (i === -1) return false;
        db.comparisons.splice(i, 1);
        return true;
      },
    },
    reports: {
      async create(reporterId, r) {
        const row: CommunityReportRow = { ...r, id: randomUUID(), reporter_id: reporterId, moderation_status: "pending", flag_count: 0, created_at: new Date().toISOString(), moderated_at: null };
        db.reports.push(row);
        return row;
      },
      async listPublic({ limit, offset }) {
        const items = db.reports
          .filter((r) => r.moderation_status === "approved")
          .map(({ reporter_id: _r, scan_id: _s, flag_count: _f, moderation_status: _m, ...pub }) => pub);
        return { items: items.slice(offset, offset + limit), total: items.length };
      },
      async listMine(reporterId) {
        return db.reports.filter((r) => r.reporter_id === reporterId);
      },
      async delete(id, reporterId) {
        const i = db.reports.findIndex((r) => r.id === id && (r.reporter_id === reporterId || isAdmin()));
        if (i === -1) return false;
        db.reports.splice(i, 1);
        return true;
      },
      async deleteAllMine(reporterId) {
        const before = db.reports.length;
        db.reports = db.reports.filter((r) => r.reporter_id !== reporterId);
        return before - db.reports.length;
      },
      async flag(reportId, uid) {
        const r = db.reports.find((x) => x.id === reportId);
        if (!r || r.moderation_status !== "approved" || r.reporter_id === uid) return "not_allowed";
        if (db.flags.some((f) => f.report_id === reportId && f.flagger_id === uid)) return "duplicate";
        db.flags.push({ report_id: reportId, flagger_id: uid });
        r.flag_count++;
        if (r.flag_count >= 3) r.moderation_status = "pending";
        return "ok";
      },
      async listForModeration(status) {
        if (!isAdmin()) return [];
        return db.reports.filter((r) => (status === "flagged" ? r.flag_count > 0 : r.moderation_status === status));
      },
      async moderate(reportId, action, reason) {
        if (!isAdmin()) throw forbidden();
        const r = db.reports.find((x) => x.id === reportId);
        if (!r) throw new NotFoundError();
        const prev = r.moderation_status;
        r.moderation_status = ({ approve: "approved", reject: "rejected", remove: "removed", requeue: "pending" } as const)[action];
        r.moderated_at = new Date().toISOString();
        db.actions.push({ id: randomUUID(), admin_id: userId, report_id: reportId, action, previous_status: prev, new_status: r.moderation_status, reason, created_at: r.moderated_at });
        return r;
      },
      async moderationLog() {
        return isAdmin() ? db.actions : [];
      },
    },
    profiles: {
      async get(id) {
        return id === userId || isAdmin() ? (db.profiles.get(id) ?? null) : null;
      },
      async update(id, patch) {
        const p = db.profiles.get(id);
        if (!p || id !== userId) throw forbidden();
        Object.assign(p, patch);
        return p;
      },
      async adminStats() {
        if (!isAdmin()) throw forbidden();
        return { total_users: db.profiles.size, total_scans: db.scans.length, scans_last_7_days: db.scans.length, scans_by_level: {}, scans_by_mode: {}, reports_by_status: {}, flagged_reports: 0 };
      },
    },
    benchmarks: { list: async () => [] },
    analyzer: createMockAnalyzer(),
    inspectUrl: async (url: string): Promise<UrlInspection> => ({
      summary: { submitted_url: url, final_url: url, domain: new URL(url).hostname, redirects: [], status: 200, fetched: true, error: null, notes: [], retrieved_at: new Date().toISOString() },
      title: "Fixture",
      description: null,
      contentType: "text/html",
      truncated: false,
      pageText: "Join our team. Pay the registration fee of Rs 500 to confirm your slot.",
      jobPosting: null,
      findings: [],
    }),
    checkCompany: async () => ({ checked: [], claims: [], observations: [], not_checked: [], official_registries: [] }),
    deleteAuthUser: null,
    allowedOrigins: [ORIGIN],
    now: () => new Date("2026-11-24T10:00:00Z"),
    log: (event, details) => db.logs.push({ event, details }),
    ...opts,
  };
  return ctx;
}

export function jsonRequest(path: string, body: unknown, init: { method?: string; origin?: string | null; headers?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json", host: "localhost:3000", ...init.headers };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  return new Request(`${ORIGIN}${path}`, { method: init.method ?? "POST", headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}

export function getRequest(path: string): Request {
  return new Request(`${ORIGIN}${path}`, { method: "GET", headers: { host: "localhost:3000" } });
}
