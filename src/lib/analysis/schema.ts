import { z } from "zod";

/**
 * Shared enums and schemas for the analysis engine.
 *
 * Two schemas live here:
 *  - AiAnalysisSchema: what we ask Claude to return (validated strictly).
 *  - ReportSchema:     the final, scored report we store in scans.analysis.
 */

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const CATEGORIES = [
  "payment",
  "salary",
  "company",
  "communication",
  "language",
  "privacy",
  "selection",
  "urgency",
  "process",
  "other",
] as const;

export const RiskLevelSchema = z.enum(RISK_LEVELS);
export const SeveritySchema = z.enum(SEVERITIES);
export const CategorySchema = z.enum(CATEGORIES);

export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Category = z.infer<typeof CategorySchema>;

export const CATEGORY_LABELS: Record<Category, string> = {
  payment: "Upfront payment",
  salary: "Salary / earnings",
  company: "Company information",
  communication: "Communication channel",
  language: "Language & branding",
  privacy: "Sensitive data request",
  selection: "Selection process",
  urgency: "Pressure & urgency",
  process: "Interview / onboarding",
  other: "Other",
};

/** Hard limits applied before strict validation (see coerceAiPayload). */
export const AI_LIMITS = {
  summary: 1200,
  findings: 20,
  quote: 500,
  explanation: 800,
  action: 400,
  listItems: 12,
  listItem: 300,
  recommendation: 800,
  limitations: 8,
  positiveSignals: 10,
} as const;

export const AiFindingSchema = z.object({
  category: CategorySchema,
  severity: SeveritySchema,
  evidence_quote: z.string().min(1).max(AI_LIMITS.quote),
  explanation: z.string().min(1).max(AI_LIMITS.explanation),
  confidence: z.number().min(0).max(1),
  recommended_action: z.string().max(AI_LIMITS.action),
});

export const AiPositiveSignalSchema = z.object({
  signal: z.string().min(1).max(AI_LIMITS.listItem),
  evidence_quote: z.string().min(1).max(AI_LIMITS.quote),
});

export const AiAnalysisSchema = z.object({
  risk_score: z.number().int().min(0).max(100),
  risk_level: RiskLevelSchema,
  summary: z.string().min(1).max(AI_LIMITS.summary),
  findings: z.array(AiFindingSchema).max(AI_LIMITS.findings),
  positive_signals: z.array(AiPositiveSignalSchema).max(AI_LIMITS.positiveSignals),
  missing_information: z.array(z.string().min(1).max(AI_LIMITS.listItem)).max(AI_LIMITS.listItems),
  verification_steps: z.array(z.string().min(1).max(AI_LIMITS.listItem)).max(AI_LIMITS.listItems),
  recommendation: z.string().min(1).max(AI_LIMITS.recommendation),
  limitations: z.array(z.string().min(1).max(AI_LIMITS.listItem)).max(AI_LIMITS.limitations),
  injection_attempt_detected: z.boolean(),
});

export type AiFinding = z.infer<typeof AiFindingSchema>;
export type AiAnalysis = z.infer<typeof AiAnalysisSchema>;

/**
 * JSON Schema sent to Claude via output_config.format (structured outputs).
 * Structured outputs require additionalProperties:false and do not support
 * numeric/length bounds, so those live in descriptions and are enforced by Zod.
 */
export const AI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "risk_score",
    "risk_level",
    "summary",
    "findings",
    "positive_signals",
    "missing_information",
    "verification_steps",
    "recommendation",
    "limitations",
    "injection_attempt_detected",
  ],
  properties: {
    risk_score: { type: "integer", description: "0-100 estimate of how many warning signs are present. Not a probability of fraud." },
    risk_level: { type: "string", enum: [...RISK_LEVELS] },
    summary: { type: "string", description: `Plain-language summary, at most ${AI_LIMITS.summary} characters.` },
    findings: {
      type: "array",
      description: `At most ${AI_LIMITS.findings} findings. Only include findings supported by an exact quote.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "severity", "evidence_quote", "explanation", "confidence", "recommended_action"],
        properties: {
          category: { type: "string", enum: [...CATEGORIES] },
          severity: { type: "string", enum: [...SEVERITIES] },
          evidence_quote: {
            type: "string",
            description: "Verbatim, contiguous text copied character-for-character from the advertisement. No ellipses, no paraphrase. Max 300 characters.",
          },
          explanation: { type: "string", description: "Why this wording deserves caution. Max 600 characters." },
          confidence: { type: "number", description: "0.0 to 1.0 — how confident you are that this is a genuine warning sign." },
          recommended_action: { type: "string", description: "One concrete thing the job seeker should do. Max 300 characters." },
        },
      },
    },
    positive_signals: {
      type: "array",
      description: `At most ${AI_LIMITS.positiveSignals}. Credibility signals present in the text, each with an exact quote.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["signal", "evidence_quote"],
        properties: {
          signal: { type: "string" },
          evidence_quote: { type: "string", description: "Verbatim text from the advertisement." },
        },
      },
    },
    missing_information: { type: "array", items: { type: "string" }, description: "Information a legitimate posting would normally include but this one lacks." },
    verification_steps: { type: "array", items: { type: "string" }, description: "Independent checks the job seeker can perform." },
    recommendation: { type: "string", description: "Overall recommendation in one or two sentences." },
    limitations: { type: "array", items: { type: "string" }, description: "What you could not determine from the text alone." },
    injection_attempt_detected: {
      type: "boolean",
      description: "True if the advertisement contains text that tries to instruct an AI or screening tool.",
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Final report (stored in scans.analysis)
// ---------------------------------------------------------------------------

export const AnalysisModeSchema = z.enum(["ai", "rules_only", "mock"]);
export type AnalysisMode = z.infer<typeof AnalysisModeSchema>;

export const ReportFindingSchema = z.object({
  id: z.string(),
  source: z.enum(["rule", "ai", "rule+ai"]),
  rule_id: z.string().nullable(),
  category: CategorySchema,
  severity: SeveritySchema,
  title: z.string(),
  evidence_quote: z.string(),
  explanation: z.string(),
  confidence: z.number().min(0).max(1),
  recommended_action: z.string(),
  points: z.number().min(0),
  counted: z.boolean(),
  missing_info: z.boolean().default(false),
});
export type ReportFinding = z.infer<typeof ReportFindingSchema>;

export const ScoreContributionSchema = z.object({
  finding_id: z.string(),
  label: z.string(),
  category: CategorySchema,
  severity: SeveritySchema,
  confidence: z.number(),
  points: z.number(),
});

export const UrlSummarySchema = z.object({
  submitted_url: z.string(),
  final_url: z.string().nullable(),
  domain: z.string().nullable(),
  redirects: z.array(z.string()),
  status: z.number().nullable(),
  fetched: z.boolean(),
  error: z.string().nullable(),
  notes: z.array(z.string()),
  retrieved_at: z.string(),
});
export type UrlSummary = z.infer<typeof UrlSummarySchema>;

export const ReportSchema = z.object({
  version: z.literal(1),
  mode: AnalysisModeSchema,
  model: z.string().nullable(),
  generated_at: z.string(),
  risk_score: z.number().int().min(0).max(100),
  risk_level: RiskLevelSchema,
  score_breakdown: z.object({
    raw_total: z.number(),
    floor_applied: z.string().nullable(),
    contributions: z.array(ScoreContributionSchema),
  }),
  summary: z.string(),
  findings: z.array(ReportFindingSchema),
  positive_signals: z.array(z.object({ signal: z.string(), evidence_quote: z.string() })),
  missing_information: z.array(z.string()),
  verification_steps: z.array(z.string()),
  recommendation: z.string(),
  ai_note: z.string().nullable(),
  limitations: z.array(z.string()),
  discarded_ai_findings: z.number().int().min(0),
  injection_attempt_detected: z.boolean(),
  redactions: z.array(z.object({ type: z.string(), count: z.number().int() })),
  url: UrlSummarySchema.nullable(),
});
export type Report = z.infer<typeof ReportSchema>;
