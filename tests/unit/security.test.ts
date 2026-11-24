import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";
import { getServerEnv } from "@/lib/env";
import { MemoryRateLimiter } from "@/lib/security/memory-rate-limit";
import { isSameOrigin } from "@/lib/security/http";
import { escapeIlike } from "@/lib/db/supabase-repos";
import { cleanText, CreateReportSchema, CreateScanSchema } from "@/lib/validation";

describe("open-redirect protection", () => {
  it("allows only same-site relative paths", () => {
    expect(safeNextPath("/scans/123")).toBe("/scans/123");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/x?u=http://a", "", null, undefined]) {
      expect(safeNextPath(bad as string)).toBe("/dashboard");
    }
  });
});

describe("environment safety", () => {
  it("refuses mock AI in production", () => {
    expect(() => getServerEnv({ JOBSHIELD_MOCK_AI: "1", VERCEL_ENV: "production" })).toThrow(/must not be enabled/);
    expect(getServerEnv({ JOBSHIELD_MOCK_AI: "1" }).mockAi).toBe(true);
  });
  it("treats blank keys as missing and clamps token limits", () => {
    const env = getServerEnv({ ANTHROPIC_API_KEY: "  ", ANTHROPIC_MAX_OUTPUT_TOKENS: "999999", ANTHROPIC_EFFORT: "turbo" });
    expect(env.anthropicApiKey).toBeNull();
    expect(env.anthropicMaxTokens).toBe(16000);
    expect(env.anthropicEffort).toBe("medium");
    expect(env.anthropicModel).toBe("claude-sonnet-5-5");
  });
});

describe("in-memory rate limiter", () => {
  it("allows up to the limit within the window, then reports wait time", () => {
    let t = 0;
    const l = new MemoryRateLimiter(2, 10_000, () => t);
    expect(l.check("ip")).toBe(0);
    expect(l.check("ip")).toBe(0);
    expect(l.check("ip")).toBe(10);
    expect(l.check("other")).toBe(0);
    t = 10_001;
    expect(l.check("ip")).toBe(0);
  });
  it("bounds memory use", () => {
    const l = new MemoryRateLimiter(1, 60_000, () => 0, 100);
    for (let i = 0; i < 500; i++) l.check(`k${i}`);
    expect((l as unknown as { hits: Map<string, number[]> }).hits.size).toBeLessThanOrEqual(100);
  });
});

describe("request hygiene", () => {
  const req = (headers: Record<string, string>, method = "POST") => new Request("http://localhost:3000/api/x", { method, headers });
  it("same-origin check", () => {
    expect(isSameOrigin(req({ host: "localhost:3000", origin: "http://localhost:3000" }))).toBe(true);
    expect(isSameOrigin(req({ host: "localhost:3000", origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(req({ host: "localhost:3000" }))).toBe(false);
    expect(isSameOrigin(req({ host: "localhost:3000", referer: "http://localhost:3000/scan" }))).toBe(true);
    expect(isSameOrigin(req({ host: "localhost:3000" }, "GET"))).toBe(true);
    expect(isSameOrigin(req({ host: "internal:3000", origin: "https://jobshield.example" }), ["https://jobshield.example"])).toBe(true);
  });
  it("escapes search wildcards and PostgREST filter syntax", () => {
    expect(escapeIlike("50%_off")).toBe("50\\%\\_off");
    expect(escapeIlike("a,b),title.eq.x")).toBe("a b  title.eq.x");
  });
  it("strips control characters and normalises newlines", () => {
    expect(cleanText("a\u0000b\r\nc\u0007")).toBe("ab\nc");
  });
  it("scan schema requires text or URL and enforces maximum length", () => {
    expect(CreateScanSchema.safeParse({ text: "" }).success).toBe(false);
    expect(CreateScanSchema.safeParse({ url: "https://example.com/job" }).success).toBe(true);
    expect(CreateScanSchema.safeParse({ text: "x".repeat(15001) }).success).toBe(false);
  });
  it("report schema rejects non-http links and missing guideline confirmation", () => {
    const base = { company_name: "Acme", description: "x".repeat(40), accept_guidelines: true };
    expect(CreateReportSchema.safeParse(base).success).toBe(true);
    expect(CreateReportSchema.safeParse({ ...base, opportunity_url: "javascript:alert(1)" }).success).toBe(false);
    expect(CreateReportSchema.safeParse({ ...base, accept_guidelines: false }).success).toBe(false);
  });
});
