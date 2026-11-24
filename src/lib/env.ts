import { z } from "zod";

/**
 * Environment configuration. Server secrets are only read inside functions
 * that run on the server; nothing here is exposed to the browser except
 * NEXT_PUBLIC_* values.
 */

const EffortSchema = z.enum(["low", "medium", "high"]);

export interface ServerEnv {
  anthropicApiKey: string | null;
  anthropicModel: string;
  anthropicEffort: "low" | "medium" | "high";
  anthropicMaxTokens: number;
  mockAi: boolean;
  serviceRoleKey: string | null;
  isProduction: boolean;
}

function blankToNull(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export function getServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const isProduction = source.VERCEL_ENV === "production";
  const mockRequested = source.JOBSHIELD_MOCK_AI === "1";
  if (mockRequested && isProduction) {
    throw new Error("JOBSHIELD_MOCK_AI must not be enabled in production.");
  }
  const effort = EffortSchema.safeParse(source.ANTHROPIC_EFFORT ?? "medium");
  const maxTokens = Number.parseInt(source.ANTHROPIC_MAX_OUTPUT_TOKENS ?? "4000", 10);
  return {
    anthropicApiKey: blankToNull(source.ANTHROPIC_API_KEY),
    anthropicModel: blankToNull(source.ANTHROPIC_MODEL) ?? "claude-sonnet-5-5",
    anthropicEffort: effort.success ? effort.data : "medium",
    anthropicMaxTokens: Number.isFinite(maxTokens) ? Math.min(Math.max(maxTokens, 1000), 16000) : 4000,
    mockAi: mockRequested,
    serviceRoleKey: blankToNull(source.SUPABASE_SERVICE_ROLE_KEY),
    isProduction,
  };
}

export interface PublicEnv {
  supabaseUrl: string | null;
  supabaseKey: string | null;
  siteUrl: string;
}

/** NEXT_PUBLIC_* must be referenced literally so Next.js can inline them. */
export function getPublicEnv(): PublicEnv {
  return {
    supabaseUrl: blankToNull(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseKey: blankToNull(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ?? blankToNull(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    siteUrl: blankToNull(process.env.NEXT_PUBLIC_SITE_URL) ?? "http://localhost:3000",
  };
}

export function isSupabaseConfigured(): boolean {
  const env = getPublicEnv();
  return Boolean(env.supabaseUrl && env.supabaseKey);
}
