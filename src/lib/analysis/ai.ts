import { AI_JSON_SCHEMA, AI_LIMITS, AiAnalysisSchema, type AiAnalysis } from "./schema";
import { SYSTEM_PROMPT, buildUserMessage, type PromptInput } from "./prompt";

/**
 * Framework-free Claude analyzer. The actual SDK call is injected
 * (see anthropic-client.ts) so parsing, validation and retry logic can be
 * unit-tested without network access or API credits.
 */

export interface MessageLike {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string | null;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface CreateMessageParams {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: "user"; content: string }[];
  output_config: {
    format: { type: "json_schema"; schema: typeof AI_JSON_SCHEMA };
    effort?: "low" | "medium" | "high";
  };
}

export type CreateMessage = (params: CreateMessageParams) => Promise<MessageLike>;

export type AiFailureReason = "refused" | "invalid_output" | "truncated" | "api_error";

export type AiResult =
  | { ok: true; data: AiAnalysis; model: string; attempts: number; mode: "ai" | "mock" }
  | { ok: false; reason: AiFailureReason; message: string; attempts: number };

export interface AiAnalyzer {
  readonly mode: "ai" | "mock";
  readonly model: string;
  analyze(input: PromptInput): Promise<AiResult>;
}

export interface ClaudeAnalyzerOptions {
  createMessage: CreateMessage;
  model: string;
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  maxAttempts?: number;
}

/** Extract the JSON text from a response (ignoring thinking blocks). */
export function extractText(message: MessageLike): string {
  return message.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();
}

/** Parse JSON, tolerating a ```json fence or leading prose. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      // fall through
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }
  throw new SyntaxError("No JSON object found in model output");
}

function clip(value: unknown, max: number): unknown {
  return typeof value === "string" && value.length > max ? value.slice(0, max) : value;
}

/**
 * Bring an otherwise well-formed payload within our size limits before strict
 * validation (truncating over-long strings/arrays rather than rejecting).
 * Types and enums are NOT coerced — those must be right.
 */
export function coerceAiPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const r = { ...(raw as Record<string, unknown>) };
  r.summary = clip(r.summary, AI_LIMITS.summary);
  r.recommendation = clip(r.recommendation, AI_LIMITS.recommendation);
  if (typeof r.risk_score === "number") r.risk_score = Math.round(Math.max(0, Math.min(100, r.risk_score)));
  if (Array.isArray(r.findings)) {
    r.findings = r.findings.slice(0, AI_LIMITS.findings).map((f) => {
      if (!f || typeof f !== "object") return f;
      const x = { ...(f as Record<string, unknown>) };
      x.evidence_quote = clip(x.evidence_quote, AI_LIMITS.quote);
      x.explanation = clip(x.explanation, AI_LIMITS.explanation);
      x.recommended_action = clip(x.recommended_action, AI_LIMITS.action);
      if (typeof x.confidence === "number") x.confidence = Math.max(0, Math.min(1, x.confidence));
      return x;
    });
  }
  if (Array.isArray(r.positive_signals)) {
    r.positive_signals = r.positive_signals.slice(0, AI_LIMITS.positiveSignals).map((p) => {
      if (!p || typeof p !== "object") return p;
      const x = { ...(p as Record<string, unknown>) };
      x.signal = clip(x.signal, AI_LIMITS.listItem);
      x.evidence_quote = clip(x.evidence_quote, AI_LIMITS.quote);
      return x;
    });
  }
  for (const key of ["missing_information", "verification_steps"] as const) {
    if (Array.isArray(r[key])) r[key] = (r[key] as unknown[]).slice(0, AI_LIMITS.listItems).map((s) => clip(s, AI_LIMITS.listItem));
  }
  if (Array.isArray(r.limitations)) r.limitations = r.limitations.slice(0, AI_LIMITS.limitations).map((s) => clip(s, AI_LIMITS.listItem));
  return r;
}

export function validateAiOutput(text: string): { ok: true; data: AiAnalysis } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = parseJsonLoose(text);
  } catch (e) {
    return { ok: false, error: `Malformed JSON: ${(e as Error).message}` };
  }
  const parsed = AiAnalysisSchema.safeParse(coerceAiPayload(raw));
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return { ok: false, error: `Schema validation failed — ${issues.join("; ")}` };
  }
  return { ok: true, data: parsed.data };
}

export function createClaudeAnalyzer(opts: ClaudeAnalyzerOptions): AiAnalyzer {
  const maxAttempts = opts.maxAttempts ?? 2;
  return {
    mode: "ai",
    model: opts.model,
    async analyze(input: PromptInput): Promise<AiResult> {
      let lastError = "Unknown error";
      let lastReason: AiFailureReason = "api_error";
      let maxTokens = opts.maxTokens;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let message: MessageLike;
        try {
          message = await opts.createMessage({
            model: opts.model,
            max_tokens: maxTokens,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: buildUserMessage(input) }],
            output_config: {
              format: { type: "json_schema", schema: AI_JSON_SCHEMA },
              ...(opts.effort ? { effort: opts.effort } : {}),
            },
          });
        } catch (e) {
          // The SDK already retries transient network/429/5xx errors.
          const status = (e as { status?: number }).status;
          return {
            ok: false,
            reason: "api_error",
            message: status ? `Claude API error (HTTP ${status})` : "Could not reach the Claude API",
            attempts: attempt,
          };
        }

        if (message.stop_reason === "refusal") {
          return { ok: false, reason: "refused", message: "Claude declined to analyse this content.", attempts: attempt };
        }
        if (message.stop_reason === "max_tokens") {
          lastReason = "truncated";
          lastError = "The analysis was cut off before completion.";
          maxTokens = Math.min(maxTokens * 2, 16000);
          continue;
        }

        const result = validateAiOutput(extractText(message));
        if (result.ok) {
          return { ok: true, data: result.data, model: message.model ?? opts.model, attempts: attempt, mode: "ai" };
        }
        lastReason = "invalid_output";
        lastError = result.error;
      }
      return { ok: false, reason: lastReason, message: lastError, attempts: maxAttempts };
    },
  };
}
