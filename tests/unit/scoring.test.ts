import { describe, expect, it } from "vitest";
import { scoreFindings, levelForScore, deduplicate, MISSING_INFO_CAP, type CandidateFinding } from "@/lib/analysis/scoring";

let n = 0;
function f(partial: Partial<CandidateFinding>): CandidateFinding {
  n++;
  return {
    id: `f${n}`,
    source: "rule",
    rule_id: `rule.${n}`,
    signal: null,
    category: "other",
    severity: "medium",
    title: `Finding ${n}`,
    evidence_quote: `quote ${n}`,
    explanation: "x",
    confidence: 1,
    recommended_action: "y",
    start: n * 100,
    end: n * 100 + 10,
    missing_info: false,
    ...partial,
  };
}

describe("risk bands", () => {
  it("maps scores to documented bands", () => {
    expect(levelForScore(0)).toBe("low");
    expect(levelForScore(24)).toBe("low");
    expect(levelForScore(25)).toBe("medium");
    expect(levelForScore(49)).toBe("medium");
    expect(levelForScore(50)).toBe("high");
    expect(levelForScore(74)).toBe("high");
    expect(levelForScore(75)).toBe("critical");
    expect(levelForScore(100)).toBe("critical");
  });
});

describe("scoring", () => {
  it("returns 0 / low with no findings", () => {
    const r = scoreFindings([]);
    expect(r.score).toBe(0);
    expect(r.level).toBe("low");
  });

  it("computes points as severity × confidence", () => {
    const r = scoreFindings([f({ severity: "medium", confidence: 0.5, category: "urgency" })]);
    expect(r.raw_total).toBe(6);
    expect(r.score).toBe(6);
  });

  it("applies a floor for a confident critical finding", () => {
    const r = scoreFindings([f({ severity: "critical", confidence: 0.9, category: "payment" })]);
    expect(r.raw_total).toBe(36);
    expect(r.score).toBe(60);
    expect(r.level).toBe("high");
    expect(r.floor_applied).not.toBeNull();
  });

  it("does not apply floors to low-confidence findings", () => {
    const r = scoreFindings([f({ severity: "critical", confidence: 0.5, category: "payment" })]);
    expect(r.score).toBe(20);
  });

  it("clamps to 100", () => {
    const cats = ["payment", "privacy", "process", "selection", "salary", "communication"] as const;
    const r = scoreFindings(cats.map((category) => f({ category, severity: "critical", confidence: 1 })));
    expect(r.score).toBe(100);
    expect(r.level).toBe("critical");
  });

  it("ignores findings below the minimum confidence", () => {
    const r = scoreFindings([f({ severity: "high", confidence: 0.2, category: "salary" })]);
    expect(r.score).toBe(0);
    expect(r.findings[0]!.counted).toBe(false);
  });
});

describe("duplicate-signal handling", () => {
  it("merges findings with the same signal key so one behaviour counts once", () => {
    const a = f({ signal: "payment.upfront", category: "payment", severity: "critical", confidence: 0.9 });
    const b = f({ signal: "payment.upfront", category: "payment", severity: "critical", confidence: 0.85 });
    const r = scoreFindings([a, b]);
    expect(r.findings).toHaveLength(1);
    expect(r.raw_total).toBe(36);
  });

  it("merges a rule finding and an AI finding quoting the same span", () => {
    const rule = f({ source: "rule", category: "payment", severity: "critical", confidence: 0.9, start: 10, end: 60 });
    const ai = f({ source: "ai", rule_id: null, category: "payment", severity: "high", confidence: 0.95, start: 20, end: 50, explanation: "AI context" });
    const merged = deduplicate([rule, ai]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.explanation).toBe("AI context");
    const r = scoreFindings([rule, ai]);
    expect(r.findings[0]!.source).toBe("rule+ai");
    expect(r.findings[0]!.confidence).toBe(0.95);
  });

  it("keeps findings in different categories separate even if their spans overlap", () => {
    const r = scoreFindings([
      f({ category: "payment", start: 0, end: 50 }),
      f({ category: "urgency", start: 10, end: 40 }),
    ]);
    expect(r.findings).toHaveLength(2);
  });

  it("applies diminishing returns within a category", () => {
    const r = scoreFindings([
      f({ category: "urgency", severity: "medium", confidence: 1 }),
      f({ category: "urgency", severity: "medium", confidence: 1 }),
      f({ category: "urgency", severity: "medium", confidence: 1 }),
    ]);
    // 12 + 6 + 3
    expect(r.raw_total).toBe(21);
  });

  it("caps missing-information findings", () => {
    const r = scoreFindings([
      f({ missing_info: true, severity: "high", confidence: 1, category: "company", start: -1, end: -1 }),
      f({ missing_info: true, severity: "high", confidence: 1, category: "company", start: -1, end: -1 }),
    ]);
    expect(r.raw_total).toBeLessThanOrEqual(MISSING_INFO_CAP);
    expect(r.level).toBe("low");
    expect(r.floor_applied).toBeNull();
  });

  it("lists contributions that sum to the raw total", () => {
    const r = scoreFindings([
      f({ category: "payment", severity: "critical", confidence: 0.9 }),
      f({ category: "urgency", severity: "medium", confidence: 0.75 }),
      f({ category: "communication", severity: "medium", confidence: 0.6 }),
    ]);
    const sum = r.contributions.reduce((s, c) => s + c.points, 0);
    expect(Math.abs(sum - r.raw_total)).toBeLessThan(0.2);
  });
});
