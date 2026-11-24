import { z } from "zod";
import { runRules } from "@/lib/analysis/rules";

/**
 * Salary plausibility checks.
 *
 * JobShield ships with NO built-in salary data. Benchmarks come only from the
 * `salary_benchmarks` table, which admins populate with a cited source and a
 * retrieval date. If no matching benchmark exists we say so instead of
 * guessing, and fall back to wording-based checks that do not need data.
 */

export const PERIODS = ["hour", "day", "week", "month", "year"] as const;
export type Period = (typeof PERIODS)[number];

export const EXPERIENCE_LEVELS = ["student", "fresher", "junior", "mid", "senior"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

const MONTHLY_FACTOR: Record<Period, number> = { hour: 160, day: 22, week: 52 / 12, month: 1, year: 1 / 12 };

export function toMonthly(amount: number, period: Period): number {
  return amount * MONTHLY_FACTOR[period];
}

const CURRENCY_TOKENS: [RegExp, string][] = [
  [/^(?:₹|rs\.?|inr)$/i, "INR"],
  [/^(?:\$|usd|us\$)$/i, "USD"],
  [/^(?:£|gbp)$/i, "GBP"],
  [/^(?:€|eur)$/i, "EUR"],
  [/^(?:aed|dhs?)$/i, "AED"],
  [/^sgd$/i, "SGD"],
  [/^cad$/i, "CAD"],
  [/^aud$/i, "AUD"],
];

function currencyCode(token: string): string | null {
  for (const [re, code] of CURRENCY_TOKENS) if (re.test(token.trim())) return code;
  return null;
}

const MULTIPLIERS: Record<string, number> = { k: 1e3, thousand: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5, lpa: 1e5, crore: 1e7, cr: 1e7, m: 1e6, million: 1e6 };

function periodFrom(token: string | undefined, multiplier: string | undefined): Period | null {
  if (multiplier && /^lpa$/i.test(multiplier)) return "year";
  if (!token) return null;
  const t = token.toLowerCase();
  if (/hour|hr|hourly/.test(t)) return "hour";
  if (/day|daily/.test(t)) return "day";
  if (/week/.test(t)) return "week";
  if (/month|pm|p\.m\./.test(t)) return "month";
  if (/year|annum|annual|pa|p\.a\./.test(t)) return "year";
  return null;
}

export interface SalaryClaim {
  raw: string;
  index: number;
  currency: string | null;
  min: number;
  max: number;
  period: Period | null;
  monthlyMin: number | null;
  monthlyMax: number | null;
}

const NUM = String.raw`\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const MULT = String.raw`k|thousand|lakhs?|lacs?|lpa|l|crore|cr|million|m`;
const CUR = String.raw`₹|rs\.?|inr|us\$|\$|usd|£|gbp|€|eur|aed|sgd|cad|aud`;
const PER = String.raw`(?:\s*(?:\/|per|a|an|every|each)\s*|\s+)(hour|hr|day|week|month|year|annum)|\s*(hourly|daily|weekly|monthly|yearly|annually|p\.?a\.?|p\.?m\.?)\b`;

const SALARY_RE = new RegExp(
  String.raw`(${CUR})\s?(${NUM})\s*(${MULT})?(?:\s*(?:-|–|to)\s*(?:${CUR})?\s?(${NUM})\s*(${MULT})?)?(?:${PER})?|\b(${NUM})\s*(${MULT})?(?:\s*(?:-|–|to)\s*(${NUM})\s*(${MULT})?)?\s*(lpa)\b`,
  "gi",
);

function toNumber(n: string | undefined, mult: string | undefined): number {
  if (!n) return NaN;
  const base = Number.parseFloat(n.replace(/,/g, ""));
  const m = mult ? (MULTIPLIERS[mult.toLowerCase()] ?? 1) : 1;
  return base * m;
}

export function parseSalaryClaims(text: string): SalaryClaim[] {
  const claims: SalaryClaim[] = [];
  for (const m of text.matchAll(SALARY_RE)) {
    let currency: string | null;
    let min: number;
    let max: number;
    let period: Period | null;
    if (m[1]) {
      currency = currencyCode(m[1]);
      min = toNumber(m[2], m[3]);
      max = m[4] ? toNumber(m[4], m[5] ?? m[3]) : min;
      period = periodFrom(m[6] ?? m[7], m[5] ?? m[3]);
    } else {
      currency = "INR"; // "LPA" is an Indian convention (lakhs per annum)
      min = toNumber(m[8], m[9] ?? "lpa");
      max = m[10] ? toNumber(m[10], m[11] ?? "lpa") : min;
      period = "year";
    }
    if (!Number.isFinite(min) || min <= 0) continue;
    if (max < min) [min, max] = [max, min];
    claims.push({
      raw: m[0].trim(),
      index: m.index ?? 0,
      currency,
      min,
      max,
      period,
      monthlyMin: period ? Math.round(toMonthly(min, period)) : null,
      monthlyMax: period ? Math.round(toMonthly(max, period)) : null,
    });
  }
  return claims;
}

export const BenchmarkSchema = z.object({
  id: z.string(),
  role_keyword: z.string(),
  country: z.string(),
  currency: z.string(),
  experience_level: z.enum(EXPERIENCE_LEVELS).nullable(),
  period: z.enum(["month", "year"]),
  min_amount: z.number(),
  max_amount: z.number(),
  source_name: z.string(),
  source_url: z.string(),
  retrieved_at: z.string(),
});
export type SalaryBenchmark = z.infer<typeof BenchmarkSchema>;

export const SalaryCheckInputSchema = z.object({
  text: z.string().max(15000).optional().default(""),
  role: z.string().trim().min(2).max(120),
  experience_level: z.enum(EXPERIENCE_LEVELS),
  country: z.string().trim().min(2).max(60),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  amount: z.number().positive().max(1e12).optional(),
  period: z.enum(PERIODS).optional(),
});
export type SalaryCheckInput = z.infer<typeof SalaryCheckInputSchema>;

export interface SalaryWarning {
  severity: "low" | "medium" | "high";
  message: string;
  evidence: string | null;
}

export interface SalaryCheckResult {
  claims: SalaryClaim[];
  warnings: SalaryWarning[];
  benchmark:
    | { status: "none"; message: string }
    | {
        status: "matched";
        benchmark: SalaryBenchmark;
        benchmarkMonthlyMin: number;
        benchmarkMonthlyMax: number;
        claimedMonthlyMax: number | null;
        ratio: number | null;
        verdict: "within_range" | "above_range" | "far_above_range" | "below_range" | "not_comparable";
        message: string;
      };
  limitations: string[];
}

export function findBenchmark(input: Pick<SalaryCheckInput, "role" | "country" | "currency" | "experience_level">, benchmarks: SalaryBenchmark[]): SalaryBenchmark | null {
  const role = input.role.toLowerCase();
  const candidates = benchmarks.filter(
    (b) =>
      b.country.toLowerCase() === input.country.toLowerCase() &&
      b.currency.toUpperCase() === input.currency.toUpperCase() &&
      role.includes(b.role_keyword.toLowerCase()),
  );
  return candidates.find((b) => b.experience_level === input.experience_level) ?? candidates.find((b) => b.experience_level === null) ?? null;
}

export function checkSalary(input: SalaryCheckInput, benchmarks: SalaryBenchmark[]): SalaryCheckResult {
  const text = input.text ?? "";
  const claims = parseSalaryClaims(text);
  const warnings: SalaryWarning[] = [];
  const limitations: string[] = [
    "Salary checks compare figures only. They cannot confirm what an employer will actually pay.",
  ];

  // Wording checks that need no benchmark data
  for (const f of runRules(text).filter((r) => r.category === "salary" || r.rule_id === "salary.task_based")) {
    warnings.push({ severity: f.severity === "critical" ? "high" : (f.severity as SalaryWarning["severity"]), message: f.title + ". " + f.explanation, evidence: f.evidence_quote });
  }
  const entryLevel = input.experience_level === "student" || input.experience_level === "fresher";
  if (entryLevel && /\b(?:no|zero)\s+(?:experience|skills|qualifications?)\s+(?:required|needed)\b/i.test(text) && claims.some((c) => c.period === "day" || c.period === "week")) {
    warnings.push({ severity: "medium", message: "High per-day or per-week pay combined with 'no experience required' is a common pattern in easy-money scams.", evidence: null });
  }
  for (const c of claims) {
    if (c.max / c.min >= 3) warnings.push({ severity: "low", message: `The range ${c.raw} is unusually wide; ask what determines where you would fall in it.`, evidence: c.raw });
    if (c.currency && c.currency !== input.currency.toUpperCase()) {
      warnings.push({ severity: "low", message: `Pay is quoted in ${c.currency} but you selected ${input.currency.toUpperCase()}. Check why the currency differs from the job location.`, evidence: c.raw });
    }
  }
  if (claims.length === 0 && !input.amount) limitations.push("No salary figure was found in the text.");

  const claimedMonthlyMax =
    input.amount && input.period ? Math.round(toMonthly(input.amount, input.period)) : (claims.find((c) => c.monthlyMax !== null && (!c.currency || c.currency === input.currency.toUpperCase()))?.monthlyMax ?? null);

  const bm = findBenchmark(input, benchmarks);
  if (!bm) {
    return {
      claims,
      warnings,
      benchmark: {
        status: "none",
        message: `No verified salary benchmark is configured for "${input.role}" in ${input.country} (${input.currency.toUpperCase()}). JobShield will not guess a typical salary. Compare with official labour statistics or reputable salary surveys for your location.`,
      },
      limitations,
    };
  }

  const bMin = Math.round(toMonthly(bm.min_amount, bm.period));
  const bMax = Math.round(toMonthly(bm.max_amount, bm.period));
  let verdict: "within_range" | "above_range" | "far_above_range" | "below_range" | "not_comparable" = "not_comparable";
  let ratio: number | null = null;
  let message = "No comparable salary figure (amount with a pay period) was found, so the benchmark could not be applied.";
  if (claimedMonthlyMax !== null && bMax > 0) {
    ratio = Math.round((claimedMonthlyMax / bMax) * 100) / 100;
    if (ratio > 2) {
      verdict = "far_above_range";
      message = `The offered pay is about ${ratio}× the top of the benchmark range. Pay far above market rates is a common lure.`;
      warnings.push({ severity: "high", message, evidence: null });
    } else if (ratio > 1.3) {
      verdict = "above_range";
      message = `The offered pay is above the benchmark range (${ratio}× its upper bound). Ask how it is calculated.`;
      warnings.push({ severity: "medium", message, evidence: null });
    } else if (claimedMonthlyMax < bMin * 0.5) {
      verdict = "below_range";
      message = "The offered pay is well below the benchmark range. This is not a scam signal but may indicate an unfair offer.";
    } else {
      verdict = "within_range";
      message = "The offered pay is broadly within the benchmark range.";
    }
  }
  limitations.push(`Benchmark: ${bm.source_name}, retrieved ${bm.retrieved_at}. Benchmarks are approximate and vary by employer and city.`);
  return {
    claims,
    warnings,
    benchmark: { status: "matched", benchmark: bm, benchmarkMonthlyMin: bMin, benchmarkMonthlyMax: bMax, claimedMonthlyMax, ratio, verdict, message },
    limitations,
  };
}
