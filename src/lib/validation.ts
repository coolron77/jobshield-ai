import { z } from "zod";
import { INPUT_LIMITS } from "@/lib/analysis/pipeline";
import { RISK_LEVELS } from "@/lib/analysis/schema";
import { FLAG_REASONS, MODERATION_ACTIONS, MODERATION_STATUSES } from "@/lib/db/types";
import { UUID_RE } from "@/lib/security/http";

// Accepts any canonical UUID (Postgres gen_random_uuid() produces v4).
const uuid = () => z.string().regex(UUID_RE, "Invalid id.");

/**
 * Request schemas shared by API handlers and client forms.
 * Server-side validation is authoritative; the client reuses these for UX.
 */

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Strip control characters (except newlines and tabs) from free text. */
export function cleanText(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n");
}

export const MAX_BODY_BYTES = {
  scan: 64 * 1024,
  tool: 48 * 1024,
  small: 8 * 1024,
} as const;

export const CreateScanSchema = z
  .object({
    text: z
      .string()
      .max(INPUT_LIMITS.maxChars, `Job descriptions can be up to ${INPUT_LIMITS.maxChars.toLocaleString("en")} characters.`)
      .optional()
      .default("")
      .transform((s) => cleanText(s).trim()),
    url: optionalTrimmed(2048),
    company_name: optionalTrimmed(200),
    title: optionalTrimmed(200),
  })
  .superRefine((v, ctx) => {
    if (!v.url && v.text.length < INPUT_LIMITS.minChars) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: `Paste at least ${INPUT_LIMITS.minChars} characters of the advertisement, or provide a job URL.`,
      });
    }
    if (v.text.length > 0 && v.text.length < 15 && v.url) {
      ctx.addIssue({ code: "custom", path: ["text"], message: "Paste more of the advertisement, or leave this empty to analyse the URL only." });
    }
  });
export type CreateScanInput = z.infer<typeof CreateScanSchema>;

export const ScanListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  level: z.enum(RISK_LEVELS).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export const UrlCheckSchema = z.object({ url: z.string().trim().min(4, "Enter a URL.").max(2048) });

export const PaymentCheckSchema = z.object({
  text: z.string().trim().min(20, "Paste at least 20 characters.").max(INPUT_LIMITS.maxChars).transform(cleanText),
});

export const CreateComparisonSchema = z
  .object({
    scan_a_id: uuid(),
    scan_b_id: uuid(),
    note: optionalTrimmed(500),
  })
  .refine((v) => v.scan_a_id !== v.scan_b_id, { message: "Choose two different scans.", path: ["scan_b_id"] });

const urlOrEmpty = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), "Enter a full http(s) URL.");

export const CreateReportSchema = z.object({
  company_name: z.string().trim().min(2, "Enter the company or recruiter name.").max(200),
  opportunity_title: optionalTrimmed(200),
  opportunity_url: urlOrEmpty,
  contact_channel: optionalTrimmed(200),
  description: z
    .string()
    .trim()
    .min(30, "Describe what happened in at least 30 characters.")
    .max(4000)
    .transform(cleanText),
  evidence_excerpt: optionalTrimmed(1500),
  scan_id: uuid().optional(),
  accept_guidelines: z.literal(true, { message: "Please confirm the reporting guidelines." }),
});
export type CreateReportInput = z.infer<typeof CreateReportSchema>;

export const FlagReportSchema = z.object({
  reason: z.enum(FLAG_REASONS),
  details: optionalTrimmed(500),
});

export const ModerateSchema = z.object({
  action: z.enum(MODERATION_ACTIONS),
  reason: z.string().trim().min(3, "Give a short reason (at least 3 characters).").max(1000),
});

export const ModerationQueueSchema = z.object({
  status: z.enum([...MODERATION_STATUSES, "flagged"]).default("pending"),
});

export const UpdateProfileSchema = z
  .object({
    display_name: z.string().trim().max(80).nullable().optional(),
    store_scan_text: z.boolean().optional(),
  })
  .refine((v) => v.display_name !== undefined || v.store_scan_text !== undefined, "Nothing to update.");

export const DeleteAccountSchema = z.object({
  scope: z.enum(["data", "account"]),
  confirm: z.literal("DELETE", { message: 'Type "DELETE" to confirm.' }),
});
