import type { AiAnalyzer, AiResult } from "./ai";
import type { PromptInput } from "./prompt";
import { runRules } from "./rules";

/**
 * Deterministic stand-in for Claude, used ONLY by automated tests
 * (JOBSHIELD_MOCK_AI=1, refused in production). Its output is derived from the
 * submitted text and every report it produces is labelled mode "mock" in the UI.
 */
export function createMockAnalyzer(): AiAnalyzer {
  return {
    mode: "mock",
    model: "mock-analyzer",
    async analyze(input: PromptInput): Promise<AiResult> {
      const text = [input.adText, input.pageText].filter(Boolean).join("\n\n");
      const hits = runRules(text);
      const injection = hits.some((h) => h.rule_id === "language.ai_instruction");
      const findings = hits.slice(0, 8).map((h) => ({
        category: h.category,
        severity: h.severity,
        evidence_quote: h.evidence_quote,
        explanation: `[Mock AI] ${h.explanation}`,
        confidence: Math.min(1, h.confidence),
        recommended_action: h.recommended_action,
      }));
      // A deliberately fabricated quote: the pipeline must discard it.
      findings.push({
        category: "other",
        severity: "high",
        evidence_quote: "This sentence does not appear in the advertisement (mock fabrication test).",
        explanation: "[Mock AI] Fabricated finding used to verify evidence validation.",
        confidence: 0.9,
        recommended_action: "None",
      });
      const firstLine = text.split(/\n/).find((l) => l.trim().length > 20)?.trim().slice(0, 120);
      return {
        ok: true,
        mode: "mock",
        model: "mock-analyzer",
        attempts: 1,
        data: {
          risk_score: Math.min(100, hits.length * 15),
          risk_level: hits.length >= 5 ? "critical" : hits.length >= 3 ? "high" : hits.length >= 1 ? "medium" : "low",
          summary: `[Mock AI — test mode] Detected ${hits.length} pattern(s) in the submitted text.`,
          findings,
          positive_signals: firstLine ? [{ signal: "[Mock AI] Posting has a descriptive opening line", evidence_quote: firstLine }] : [],
          missing_information: ["[Mock AI] Recruiter's full name and official email were not checked."],
          verification_steps: ["[Mock AI] Look up the company's official careers page."],
          recommendation: "[Mock AI] Verify independently before sharing documents or paying anything.",
          limitations: ["[Mock AI] This is a deterministic test fixture, not a real Claude analysis."],
          injection_attempt_detected: injection,
        },
      };
    },
  };
}
