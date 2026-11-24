import type { AiAnalyzer } from "./ai";
import { findQuote } from "./evidence";
import { redactSensitive } from "./redact";
import { detectMissingInformation, runRules } from "./rules";
import { CATEGORY_LABELS, ReportSchema, type AnalysisMode, type Category, type Report, type RiskLevel, type UrlSummary } from "./schema";
import { scoreFindings, type CandidateFinding } from "./scoring";

export const INPUT_LIMITS = { minChars: 40, maxChars: 15000, maxPageChars: 12000 } as const;

export const PAGE_SEPARATOR = "\n\n--- Text retrieved from the submitted URL ---\n";

export interface PipelineInput {
  text: string;
  pageText?: string | null;
  submittedUrl?: string | null;
  companyName?: string | null;
  url?: UrlSummary | null;
}

export interface PipelineResult {
  report: Report;
  /** Redacted text that was analysed (and that evidence quotes refer to). */
  analyzedText: string;
}

const LEVEL_RECOMMENDATION: Record<RiskLevel, string> = {
  low: "Few warning signs were detected. Still confirm the employer through its official website before sharing personal documents.",
  medium: "Proceed carefully. Verify the company and recruiter independently, and do not pay any fee or share ID or bank details yet.",
  high: "Do not pay anything or share sensitive information until you have independently verified this opportunity with the company itself.",
  critical: "Strong warning signs were detected. We recommend not proceeding unless you can verify the employer through official channels. Never pay to get a job.",
};

const DEFAULT_STEPS: Partial<Record<Category, string>> = {
  payment: "Ask the company (via contact details on its official website, not the ad) whether any fee is genuinely required.",
  company: "Find the company's official website independently (search engine, not links in the ad) and check its careers page for this role.",
  communication: "Ask the recruiter to email you from the company's official domain and confirm their name on the company website or LinkedIn.",
  privacy: "Do not send ID, bank or login details until you have a verified written offer through an official HR channel.",
  salary: "Compare the offered pay with typical salaries for the role and location on reputable salary sites or official labour statistics.",
  selection: "Ask what the interview and selection process is and who will conduct it.",
  process: "Request a video or in-person interview with a named employee you can verify.",
};

const STANDARD_LIMITATIONS = [
  "JobShield analyses only the text provided. It did not verify the company's registration, reviews or website ownership.",
  "The risk score counts detected warning signs; it is not a statistical probability that the posting is fraudulent.",
];

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function dedupeStrings(items: string[], max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    const key = item.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

export function buildAnalysisText(text: string, pageText?: string | null): string {
  const ad = text.trim();
  const page = pageText?.trim().slice(0, INPUT_LIMITS.maxPageChars);
  return page ? `${ad}${PAGE_SEPARATOR}${page}` : ad;
}

export async function analyzeJobPosting(input: PipelineInput, analyzer: AiAnalyzer | null, now: Date = new Date()): Promise<PipelineResult> {
  // 1. Minimise data before anything else touches it.
  const combined = buildAnalysisText(input.text, input.pageText);
  const { text, redactions } = redactSensitive(combined);
  const [adPart, pagePart] = text.split(PAGE_SEPARATOR);

  // 2. Deterministic rules
  const ruleFindings = runRules(text);
  const candidates: CandidateFinding[] = ruleFindings.map((f, i) => ({
    id: `r${i + 1}-${slug(f.rule_id)}`,
    source: "rule",
    rule_id: f.rule_id,
    signal: f.signal,
    category: f.category,
    severity: f.severity,
    title: f.title,
    evidence_quote: f.evidence_quote,
    explanation: f.explanation,
    confidence: f.confidence,
    recommended_action: f.recommended_action,
    start: f.start,
    end: f.end,
    missing_info: false,
  }));

  const missingFromRules = detectMissingInformation(adPart ?? text);
  if (missingFromRules.length >= 2) {
    candidates.push({
      id: "m1-missing-details",
      source: "rule",
      rule_id: "company.missing_details",
      signal: "company.missing_details",
      category: "company",
      severity: missingFromRules.length >= 4 ? "medium" : "low",
      title: `Key details missing (${missingFromRules.length})`,
      evidence_quote: "",
      explanation: "Several details a genuine posting normally includes are absent. Missing information is a reason to verify, not proof of fraud.",
      confidence: missingFromRules.length >= 4 ? 0.7 : 0.6,
      recommended_action: "Ask the recruiter for the missing details in writing.",
      start: -1,
      end: -1,
      missing_info: true,
    });
  }

  // 3. Claude analysis (optional)
  let mode: AnalysisMode = "rules_only";
  let model: string | null = null;
  let summary: string | null = null;
  let aiNote: string | null = null;
  let discarded = 0;
  let injection = ruleFindings.some((f) => f.rule_id === "language.ai_instruction");
  const positive: { signal: string; evidence_quote: string }[] = [];
  const missing: string[] = [];
  const steps: string[] = [];
  const limitations: string[] = [];

  if (analyzer) {
    const result = await analyzer.analyze({
      adText: adPart ?? text,
      pageText: pagePart ?? null,
      submittedUrl: input.submittedUrl ?? null,
      claimedCompany: input.companyName ?? null,
    });
    if (result.ok) {
      mode = result.mode;
      model = result.model;
      const ai = result.data;
      summary = ai.summary;
      aiNote = ai.recommendation;
      injection = injection || ai.injection_attempt_detected;

      ai.findings.forEach((f, i) => {
        const match = findQuote(text, f.evidence_quote);
        if (!match) {
          discarded++;
          return;
        }
        candidates.push({
          id: `a${i + 1}-${f.category}`,
          source: "ai",
          rule_id: null,
          signal: null,
          category: f.category,
          severity: f.severity,
          title: CATEGORY_LABELS[f.category],
          evidence_quote: match.exact,
          explanation: f.explanation,
          confidence: f.confidence,
          recommended_action: f.recommended_action,
          start: match.start,
          end: match.end,
          missing_info: false,
        });
      });
      for (const p of ai.positive_signals) {
        const match = findQuote(text, p.evidence_quote);
        if (match) positive.push({ signal: p.signal, evidence_quote: match.exact });
        else discarded++;
      }
      missing.push(...ai.missing_information);
      steps.push(...ai.verification_steps);
      limitations.push(...ai.limitations);
      if (discarded > 0) {
        limitations.push(
          `${discarded} AI observation(s) were discarded because their quoted evidence could not be found in your text. JobShield only reports evidence it can locate.`,
        );
      }
    } else {
      limitations.push(`AI analysis was unavailable (${result.message}). This report is based on rule-based checks only.`);
    }
  } else {
    limitations.push("AI analysis is not configured on this server. This report is based on rule-based checks only.");
  }

  // 4. Score
  const scored = scoreFindings(candidates);

  // 5. Compose
  missing.unshift(...missingFromRules);
  const categories = new Set(scored.findings.map((f) => f.category));
  for (const c of categories) {
    const step = DEFAULT_STEPS[c];
    if (step) steps.push(step);
  }
  if (steps.length === 0) steps.push(DEFAULT_STEPS.company as string);

  if (!summary) {
    const counted = scored.findings.filter((f) => f.counted && !f.missing_info);
    summary =
      counted.length === 0
        ? "No rule-based warning signs were detected in this text. That does not confirm the opportunity is genuine."
        : `Rule-based checks found ${counted.length} warning sign${counted.length === 1 ? "" : "s"}, most notably: ${counted
            .slice(0, 3)
            .map((f) => f.title.toLowerCase())
            .join("; ")}.`;
  }

  if (input.url && !input.url.fetched) {
    limitations.push(`The submitted URL could not be inspected (${input.url.error ?? "unavailable"}). Only the pasted text was analysed.`);
  }

  const report: Report = {
    version: 1,
    mode,
    model,
    generated_at: now.toISOString(),
    risk_score: scored.score,
    risk_level: scored.level,
    score_breakdown: {
      raw_total: scored.raw_total,
      floor_applied: scored.floor_applied,
      contributions: scored.contributions,
    },
    summary,
    findings: scored.findings,
    positive_signals: positive,
    missing_information: dedupeStrings(missing),
    verification_steps: dedupeStrings(steps),
    recommendation: LEVEL_RECOMMENDATION[scored.level],
    ai_note: aiNote,
    limitations: dedupeStrings([...limitations, ...STANDARD_LIMITATIONS], 10),
    discarded_ai_findings: discarded,
    injection_attempt_detected: injection,
    redactions,
    url: input.url ?? null,
  };

  // Self-check: the stored report must satisfy its own schema.
  return { report: ReportSchema.parse(report), analyzedText: text };
}
