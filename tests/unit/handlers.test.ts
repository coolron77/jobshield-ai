import { describe, expect, it, beforeEach } from "vitest";
import { createScan, listScans, getScan, deleteScan } from "@/server/handlers/scans";
import { createComparison, deleteComparison, submitReport, flagReport, moderateReport, moderationQueue, adminStats, deleteReport } from "@/server/handlers/community";
import { updateProfile, exportData, deleteAccount } from "@/server/handlers/account";
import { urlCheck, paymentCheck, salaryCheck, demoScan } from "@/server/handlers/tools";
import { MemoryRateLimiter } from "@/lib/security/memory-rate-limit";
import { SAMPLE_ADS } from "@/lib/samples";
import { createDb, getRequest, jsonRequest, makeContext, type MemoryDb } from "../fixtures/memory-context";

const ALICE = "a1a1a1a1-0000-4000-8000-000000000001";
const BOB = "b2b2b2b2-0000-4000-8000-000000000002";
const ADMIN = "adadadad-0000-4000-8000-000000000003";
const CAROL = "c3c3c3c3-0000-4000-8000-000000000004";
const DAVE = "d4d4d4d4-0000-4000-8000-000000000005";
const ad = SAMPLE_ADS[0]!.text;

let db: MemoryDb;
beforeEach(() => {
  db = createDb();
});

async function scanAs(user: string, text = ad): Promise<string> {
  const res = await createScan(jsonRequest("/api/scans", { text }), makeContext(db, user));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

describe("authentication and request protection", () => {
  it("rejects unauthenticated requests on every protected endpoint", async () => {
    const anon = makeContext(db, null);
    const results = await Promise.all([
      createScan(jsonRequest("/api/scans", { text: ad }), anon),
      listScans(getRequest("/api/scans"), anon),
      getScan(getRequest("/api/scans/x"), anon, ALICE),
      deleteScan(jsonRequest("/api/scans/x", undefined, { method: "DELETE" }), anon, ALICE),
      urlCheck(jsonRequest("/api/tools/url", { url: "https://example.com" }), anon),
      paymentCheck(jsonRequest("/api/tools/payment", { text: ad }), anon),
      submitReport(jsonRequest("/api/reports", {}), anon),
      moderateReport(jsonRequest("/api/admin/reports/x/moderate", {}), anon, ALICE),
      adminStats(getRequest("/api/admin/stats"), anon),
      exportData(getRequest("/api/account/export"), anon),
      deleteAccount(jsonRequest("/api/account", { scope: "data", confirm: "DELETE" }, { method: "DELETE" }), anon),
    ]);
    for (const r of results) expect(r.status).toBe(401);
  });

  it("rejects cross-site state-changing requests (CSRF)", async () => {
    const res = await createScan(jsonRequest("/api/scans", { text: ad }, { origin: "https://evil.example" }), makeContext(db, ALICE));
    expect(res.status).toBe(403);
    const noOrigin = await createScan(jsonRequest("/api/scans", { text: ad }, { origin: null }), makeContext(db, ALICE));
    expect(noOrigin.status).toBe(403);
    expect(db.scans).toHaveLength(0);
  });

  it("rejects oversized bodies with 413 (declared and streamed)", async () => {
    const big = "x".repeat(70 * 1024);
    const res = await createScan(jsonRequest("/api/scans", { text: big }), makeContext(db, ALICE));
    expect(res.status).toBe(413);
    const lying = await createScan(jsonRequest("/api/scans", JSON.stringify({ text: big }), { headers: { "content-length": "10" } }), makeContext(db, ALICE));
    expect(lying.status).toBe(413);
  });

  it("rejects non-JSON and invalid bodies with field errors", async () => {
    const wrongType = await createScan(new Request("http://localhost:3000/api/scans", { method: "POST", headers: { "content-type": "text/plain", origin: "http://localhost:3000", host: "localhost:3000" }, body: "hi" }), makeContext(db, ALICE));
    expect(wrongType.status).toBe(415);
    const short = await createScan(jsonRequest("/api/scans", { text: "too short" }), makeContext(db, ALICE));
    expect(short.status).toBe(400);
    const body = (await short.json()) as { error: { fields: Record<string, string> } };
    expect(body.error.fields.text).toMatch(/at least 40 characters/);
    const tooLong = await createScan(jsonRequest("/api/scans", { text: "a".repeat(15001) }), makeContext(db, ALICE));
    expect(tooLong.status).toBe(400);
    const badJson = await createScan(jsonRequest("/api/scans", "{oops"), makeContext(db, ALICE));
    expect(badJson.status).toBe(400);
  });

  it("rate limits the AI scan route", async () => {
    const ctx = makeContext(db, ALICE, { rateLimitMax: 2 });
    expect((await createScan(jsonRequest("/api/scans", { text: ad }), ctx)).status).toBe(201);
    expect((await createScan(jsonRequest("/api/scans", { text: ad }), ctx)).status).toBe(201);
    const third = await createScan(jsonRequest("/api/scans", { text: ad }), ctx);
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBeTruthy();
  });

  it("never leaks internal errors", async () => {
    const ctx = makeContext(db, ALICE);
    ctx.scans.list = async () => {
      throw new Error("relation scans: connection string postgres://secret@db");
    };
    const res = await listScans(getRequest("/api/scans"), ctx);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text.includes("secret")).toBe(false);
    expect(text.includes("request_id")).toBe(true);
  });
});

describe("scan creation, history and deletion", () => {
  it("creates a scan with a real pipeline report and stores redacted text", async () => {
    const res = await createScan(jsonRequest("/api/scans", { text: ad + "\nCall 9876543210", company_name: "Global Data Solutions" }), makeContext(db, ALICE));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { risk_level: string; mode: string };
    expect(body.mode).toBe("mock");
    expect(body.risk_level).toBe("critical");
    const row = db.scans[0]!;
    expect(row.owner_id).toBe(ALICE);
    expect(row.input_text?.includes("9876543210")).toBe(false);
    expect(row.input_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.analysis.findings.length).toBeGreaterThan(0);
  });

  it("does not store text when the user has disabled it", async () => {
    const ctx = makeContext(db, ALICE);
    db.profiles.get(ALICE)!.store_scan_text = false;
    await createScan(jsonRequest("/api/scans", { text: ad }), ctx);
    expect(db.scans[0]!.input_text).toBeNull();
    expect(db.scans[0]!.analysis.findings.length).toBeGreaterThan(0);
  });

  it("analyses URL page content when a URL is given", async () => {
    const res = await createScan(jsonRequest("/api/scans", { url: "https://jobs.example.com/listing/1" }), makeContext(db, ALICE));
    expect(res.status).toBe(201);
    const row = db.scans[0]!;
    expect(row.submitted_url).toBe("https://jobs.example.com/listing/1");
    expect(row.analysis.url?.fetched).toBe(true);
    expect(row.analysis.findings.some((f) => f.category === "payment")).toBe(true);
  });

  it("returns 422 when only a URL is given and the page cannot be read", async () => {
    const ctx = makeContext(db, ALICE);
    ctx.inspectUrl = async (url) => ({
      summary: { submitted_url: url, final_url: null, domain: null, redirects: [], status: null, fetched: false, error: "Links to private, local or reserved network addresses are not allowed.", notes: [], retrieved_at: "" },
      title: null, description: null, contentType: null, truncated: false, pageText: null, jobPosting: null, findings: [],
    });
    const res = await createScan(jsonRequest("/api/scans", { url: "http://10.0.0.1/" }), ctx);
    expect(res.status).toBe(422);
    expect(db.scans).toHaveLength(0);
  });

  it("isolates scans between users (no IDOR)", async () => {
    const id = await scanAs(ALICE);
    expect((await getScan(getRequest(`/api/scans/${id}`), makeContext(db, ALICE), id)).status).toBe(200);
    expect((await getScan(getRequest(`/api/scans/${id}`), makeContext(db, BOB), id)).status).toBe(404);
    expect((await deleteScan(jsonRequest(`/api/scans/${id}`, undefined, { method: "DELETE" }), makeContext(db, BOB), id)).status).toBe(404);
    expect(db.scans).toHaveLength(1);
    const bobList = await listScans(getRequest("/api/scans"), makeContext(db, BOB));
    expect(((await bobList.json()) as { total: number }).total).toBe(0);
  });

  it("lists with search and filters, and deletes", async () => {
    await scanAs(ALICE);
    await scanAs(ALICE, SAMPLE_ADS[2]!.text);
    const all = (await (await listScans(getRequest("/api/scans"), makeContext(db, ALICE))).json()) as { total: number };
    expect(all.total).toBe(2);
    const low = (await (await listScans(getRequest("/api/scans?level=low"), makeContext(db, ALICE))).json()) as { total: number; items: { title: string }[] };
    expect(low.total).toBe(1);
    const search = (await (await listScans(getRequest("/api/scans?q=northwind"), makeContext(db, ALICE))).json()) as { total: number };
    expect(search.total).toBe(1);
    expect((await listScans(getRequest("/api/scans?level=extreme"), makeContext(db, ALICE))).status).toBe(400);
    const id = db.scans[0]!.id;
    expect((await deleteScan(jsonRequest(`/api/scans/${id}`, undefined, { method: "DELETE" }), makeContext(db, ALICE), id)).status).toBe(200);
    expect(db.scans).toHaveLength(1);
  });
});

describe("comparisons", () => {
  it("saves a comparison of two own scans and rejects others' scans", async () => {
    const a = await scanAs(ALICE);
    const b = await scanAs(ALICE, SAMPLE_ADS[2]!.text);
    const bobs = await scanAs(BOB);
    const ok = await createComparison(jsonRequest("/api/comparisons", { scan_a_id: a, scan_b_id: b }), makeContext(db, ALICE));
    expect(ok.status).toBe(201);
    const dup = await createComparison(jsonRequest("/api/comparisons", { scan_a_id: a, scan_b_id: b }), makeContext(db, ALICE));
    expect(dup.status).toBe(409);
    const foreign = await createComparison(jsonRequest("/api/comparisons", { scan_a_id: a, scan_b_id: bobs }), makeContext(db, ALICE));
    expect(foreign.status).toBe(404);
    const same = await createComparison(jsonRequest("/api/comparisons", { scan_a_id: a, scan_b_id: a }), makeContext(db, ALICE));
    expect(same.status).toBe(400);
    const cid = db.comparisons[0]!.id;
    expect((await deleteComparison(jsonRequest(`/api/comparisons/${cid}`, undefined, { method: "DELETE" }), makeContext(db, BOB), cid)).status).toBe(404);
    expect((await deleteComparison(jsonRequest(`/api/comparisons/${cid}`, undefined, { method: "DELETE" }), makeContext(db, ALICE), cid)).status).toBe(200);
  });
});

describe("community reports and moderation", () => {
  const report = {
    company_name: "Global Data Solutions",
    description: "They asked me for a registration fee before any interview and stopped replying after I paid.",
    evidence_excerpt: "pay a refundable registration fee of ₹1,999",
    accept_guidelines: true,
  };

  beforeEach(() => {
    db.profiles.set(ADMIN, { id: ADMIN, display_name: "Admin", role: "admin", store_scan_text: true, created_at: "" });
  });

  it("requires accepting the guidelines", async () => {
    const res = await submitReport(jsonRequest("/api/reports", { ...report, accept_guidelines: false }), makeContext(db, ALICE));
    expect(res.status).toBe(400);
  });

  it("submits as pending, and only admins can moderate", async () => {
    const res = await submitReport(jsonRequest("/api/reports", report), makeContext(db, ALICE));
    expect(res.status).toBe(201);
    const { id, moderation_status } = (await res.json()) as { id: string; moderation_status: string };
    expect(moderation_status).toBe("pending");

    const userTry = await moderateReport(jsonRequest(`/api/admin/reports/${id}/moderate`, { action: "approve", reason: "looks fine" }), makeContext(db, ALICE), id);
    expect(userTry.status).toBe(403);
    expect((await moderationQueue(getRequest("/api/admin/reports"), makeContext(db, BOB))).status).toBe(403);
    expect((await adminStats(getRequest("/api/admin/stats"), makeContext(db, BOB))).status).toBe(403);

    const noReason = await moderateReport(jsonRequest(`/api/admin/reports/${id}/moderate`, { action: "approve", reason: "" }), makeContext(db, ADMIN), id);
    expect(noReason.status).toBe(400);
    const approved = await moderateReport(jsonRequest(`/api/admin/reports/${id}/moderate`, { action: "approve", reason: "Meets guidelines" }), makeContext(db, ADMIN), id);
    expect(approved.status).toBe(200);
    expect(db.actions).toHaveLength(1);
    expect((await adminStats(getRequest("/api/admin/stats"), makeContext(db, ADMIN))).status).toBe(200);
  });

  it("flagging: no self-flags, no duplicates, three flags hide the report", async () => {
    const res = await submitReport(jsonRequest("/api/reports", report), makeContext(db, ALICE));
    const { id } = (await res.json()) as { id: string };
    const flag = (user: string) => flagReport(jsonRequest(`/api/reports/${id}/flag`, { reason: "inaccurate" }), makeContext(db, user), id);
    expect((await flag(BOB)).status).toBe(403); // not public yet
    await moderateReport(jsonRequest(`/api/admin/reports/${id}/moderate`, { action: "approve", reason: "Meets guidelines" }), makeContext(db, ADMIN), id);
    expect((await flag(ALICE)).status).toBe(403);
    expect((await flag(BOB)).status).toBe(201);
    expect((await flag(BOB)).status).toBe(409);
    expect((await flag(CAROL)).status).toBe(201);
    expect((await flag(DAVE)).status).toBe(201);
    expect(db.reports[0]!.moderation_status).toBe("pending");
  });

  it("reporters can withdraw their own report only", async () => {
    const res = await submitReport(jsonRequest("/api/reports", report), makeContext(db, ALICE));
    const { id } = (await res.json()) as { id: string };
    expect((await deleteReport(jsonRequest(`/api/reports/${id}`, undefined, { method: "DELETE" }), makeContext(db, BOB), id)).status).toBe(404);
    expect((await deleteReport(jsonRequest(`/api/reports/${id}`, undefined, { method: "DELETE" }), makeContext(db, ALICE), id)).status).toBe(200);
  });

  it("cannot link someone else's scan to a report", async () => {
    const bobs = await scanAs(BOB);
    const res = await submitReport(jsonRequest("/api/reports", { ...report, scan_id: bobs }), makeContext(db, ALICE));
    expect(res.status).toBe(404);
  });
});

describe("account management", () => {
  it("updates privacy settings, exports and deletes data", async () => {
    await scanAs(ALICE);
    const upd = await updateProfile(jsonRequest("/api/account", { display_name: "Alice", store_scan_text: false }, { method: "PATCH" }), makeContext(db, ALICE));
    expect(upd.status).toBe(200);
    expect(db.profiles.get(ALICE)!.store_scan_text).toBe(false);

    const exp = await exportData(getRequest("/api/account/export"), makeContext(db, ALICE));
    expect(exp.status).toBe(200);
    expect(exp.headers.get("content-disposition")).toMatch(/attachment/);
    const data = (await exp.json()) as { scans: unknown[] };
    expect(data.scans).toHaveLength(1);

    const noConfirm = await deleteAccount(jsonRequest("/api/account", { scope: "data", confirm: "yes" }, { method: "DELETE" }), makeContext(db, ALICE));
    expect(noConfirm.status).toBe(400);
    const accountNoKey = await deleteAccount(jsonRequest("/api/account", { scope: "account", confirm: "DELETE" }, { method: "DELETE" }), makeContext(db, ALICE));
    expect(accountNoKey.status).toBe(503);
    expect(db.scans).toHaveLength(1);
    const del = await deleteAccount(jsonRequest("/api/account", { scope: "data", confirm: "DELETE" }, { method: "DELETE" }), makeContext(db, ALICE));
    expect(del.status).toBe(200);
    expect(db.scans).toHaveLength(0);
  });

  it("deletes the auth account when configured", async () => {
    const deleted: string[] = [];
    await scanAs(ALICE);
    const res = await deleteAccount(jsonRequest("/api/account", { scope: "account", confirm: "DELETE" }, { method: "DELETE" }), makeContext(db, ALICE, { deleteAuthUser: async (id) => void deleted.push(id) }));
    expect(res.status).toBe(200);
    expect(deleted).toEqual([ALICE]);
  });
});

describe("tools", () => {
  it("payment and salary checks validate input", async () => {
    const p = await paymentCheck(jsonRequest("/api/tools/payment", { text: "Pay ₹2000 training fee to join." }), makeContext(db, ALICE));
    expect(p.status).toBe(200);
    expect(((await p.json()) as { verdict: string }).verdict).toBe("payment_requested");
    const s = await salaryCheck(jsonRequest("/api/tools/salary", { role: "Data entry", experience_level: "fresher", country: "India", currency: "INR", text: "Earn ₹5000 per day" }), makeContext(db, ALICE));
    expect(s.status).toBe(200);
    expect(((await s.json()) as { benchmark: { status: string } }).benchmark.status).toBe("none");
    const bad = await salaryCheck(jsonRequest("/api/tools/salary", { role: "x", experience_level: "guru", country: "", currency: "rupees" }), makeContext(db, ALICE));
    expect(bad.status).toBe(400);
  });

  it("public demo is rules-only and rate limited per IP", async () => {
    const limiter = new MemoryRateLimiter(2, 60_000);
    const req = () => jsonRequest("/api/demo/scan", { text: ad }, { headers: { "x-forwarded-for": "203.0.113.9" } });
    const anon = makeContext(db, null);
    const first = await demoScan(req(), anon, limiter);
    expect(first.status).toBe(200);
    expect(((await first.json()) as { report: { mode: string } }).report.mode).toBe("rules_only");
    expect((await demoScan(req(), anon, limiter)).status).toBe(200);
    expect((await demoScan(req(), anon, limiter)).status).toBe(429);
    expect(db.scans).toHaveLength(0);
  });
});
