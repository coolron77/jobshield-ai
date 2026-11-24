import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createClaudeAnalyzer, type AiAnalyzer, type CreateMessage, type MessageLike } from "./ai";
import { createMockAnalyzer } from "./mock-ai";
import { getServerEnv } from "@/lib/env";

/**
 * The ONLY module that talks to the Anthropic API. Server-side only — the
 * "server-only" import makes any client-side import a build error.
 */

let cached: { key: string; analyzer: AiAnalyzer | null } | null = null;

export function getAnalyzer(): AiAnalyzer | null {
  const env = getServerEnv();
  if (env.mockAi) return createMockAnalyzer();
  if (!env.anthropicApiKey) return null;

  const cacheKey = `${env.anthropicModel}|${env.anthropicEffort}|${env.anthropicMaxTokens}`;
  if (cached?.key === cacheKey) return cached.analyzer;

  const client = new Anthropic({
    apiKey: env.anthropicApiKey,
    maxRetries: 2, // SDK retries connection errors, 408/409/429/5xx with backoff
    timeout: 90_000,
  });

  const createMessage: CreateMessage = async (params) => {
    // output_config.format = structured outputs (JSON schema). Recent models do
    // not support forced tool_choice or non-default temperature, so neither is sent.
    const response = await client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming);
    return response as unknown as MessageLike;
  };

  const analyzer = createClaudeAnalyzer({
    createMessage,
    model: env.anthropicModel,
    maxTokens: env.anthropicMaxTokens,
    effort: env.anthropicEffort,
  });
  cached = { key: cacheKey, analyzer };
  return analyzer;
}
