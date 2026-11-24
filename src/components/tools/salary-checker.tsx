"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { SalaryCheckResult } from "@/lib/salary/salary";
import { EXPERIENCE_LEVELS, PERIODS } from "@/lib/salary/salary";
import { api, ApiError } from "@/lib/api-client";
import { Alert, Button, Card, CardBody, CardHeader, FieldError, Input, Label, Select, Spinner, Textarea } from "@/components/ui/primitives";
import { CoinsIcon } from "@/components/ui/icons";

const Schema = z.object({
  role: z.string().trim().min(2, "Enter the role.").max(120),
  experience_level: z.enum(EXPERIENCE_LEVELS),
  country: z.string().trim().min(2, "Enter the country.").max(60),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a 3-letter code, e.g. INR."),
  amount: z.string().trim().refine((v) => !v || (Number(v.replace(/,/g, "")) > 0 && Number.isFinite(Number(v.replace(/,/g, "")))), "Enter a positive number."),
  period: z.enum(["", ...PERIODS]),
  text: z.string().max(15000),
});
type Values = z.infer<typeof Schema>;

const EXP_LABELS: Record<(typeof EXPERIENCE_LEVELS)[number], string> = { student: "Student / intern", fresher: "Fresher (0–1 yr)", junior: "Junior (1–3 yrs)", mid: "Mid-level (3–7 yrs)", senior: "Senior (7+ yrs)" };
const SEV = { high: "text-risk-critical", medium: "text-risk-medium", low: "text-ink-soft" } as const;

export function SalaryChecker() {
  const [result, setResult] = useState<SalaryCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: { role: "", experience_level: "fresher", country: "India", currency: "INR", amount: "", period: "", text: "" },
  });

  async function onSubmit(v: Values) {
    setError(null);
    setResult(null);
    try {
      setResult(
        await api<SalaryCheckResult>("/api/tools/salary", {
          body: {
            role: v.role,
            experience_level: v.experience_level,
            country: v.country,
            currency: v.currency.toUpperCase(),
            text: v.text,
            ...(v.amount && v.period ? { amount: Number(v.amount.replace(/,/g, "")), period: v.period } : {}),
          },
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    }
  }

  const bm = result?.benchmark;
  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="role">Role</Label>
              <Input id="role" placeholder="e.g. Data entry operator" aria-invalid={!!formState.errors.role} aria-describedby="role-error" {...register("role")} />
              <FieldError id="role-error" message={formState.errors.role?.message} />
            </div>
            <div>
              <Label htmlFor="experience_level">Experience</Label>
              <Select id="experience_level" {...register("experience_level")}>
                {EXPERIENCE_LEVELS.map((l) => <option key={l} value={l}>{EXP_LABELS[l]}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="country">Job location (country)</Label>
              <Input id="country" aria-invalid={!!formState.errors.country} aria-describedby="country-error" {...register("country")} />
              <FieldError id="country-error" message={formState.errors.country?.message} />
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" maxLength={3} className="uppercase" aria-invalid={!!formState.errors.currency} aria-describedby="currency-error" {...register("currency")} />
              <FieldError id="currency-error" message={formState.errors.currency?.message} />
            </div>
            <div>
              <Label htmlFor="amount">Offered pay <span className="font-normal text-muted">(optional)</span></Label>
              <Input id="amount" inputMode="decimal" aria-invalid={!!formState.errors.amount} aria-describedby="amount-error" {...register("amount")} />
              <FieldError id="amount-error" message={formState.errors.amount?.message} />
            </div>
            <div>
              <Label htmlFor="period">Per</Label>
              <Select id="period" {...register("period")}>
                <option value="">—</option>
                {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="text">Salary wording from the ad <span className="font-normal text-muted">(optional)</span></Label>
              <Textarea id="text" rows={4} placeholder="e.g. Earn ₹25,000 per week, guaranteed!" {...register("text")} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? <><Spinner label="Checking" /> Checking…</> : <><CoinsIcon className="h-4 w-4" /> Check salary</>}
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {result && bm ? (
        <div className="space-y-6">
          {bm.status === "none" ? (
            <Alert tone="info" title="No verified benchmark available">{bm.message}</Alert>
          ) : (
            <Card>
              <CardHeader title="Benchmark comparison" description={`${bm.benchmark.source_name} · retrieved ${bm.benchmark.retrieved_at}`} />
              <CardBody className="space-y-2 text-sm">
                <p><span className="font-semibold">Benchmark range:</span> {bm.benchmark.currency} {bm.benchmarkMonthlyMin.toLocaleString("en-IN")} – {bm.benchmarkMonthlyMax.toLocaleString("en-IN")} per month</p>
                <p><span className="font-semibold">Offered (per month):</span> {bm.claimedMonthlyMax !== null ? `${bm.benchmark.currency} ${bm.claimedMonthlyMax.toLocaleString("en-IN")}` : "not determined"}</p>
                <p className="text-ink">{bm.message}</p>
                <a href={bm.benchmark.source_url} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">View source</a>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Salary claims found" />
            <CardBody>
              {result.claims.length === 0 ? <p className="text-sm text-ink-soft">No salary figures were found in the text.</p> : (
                <ul className="space-y-1 text-sm">
                  {result.claims.map((c, i) => (
                    <li key={i}>
                      <span className="font-mono text-xs">{c.raw}</span>
                      {c.monthlyMax !== null ? <span className="text-ink-soft"> ≈ {c.currency ?? ""} {c.monthlyMin === c.monthlyMax ? c.monthlyMax?.toLocaleString("en-IN") : `${c.monthlyMin?.toLocaleString("en-IN")}–${c.monthlyMax?.toLocaleString("en-IN")}`} per month</span> : <span className="text-muted"> (no pay period stated)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Warnings" />
            <CardBody>
              {result.warnings.length === 0 ? <p className="text-sm text-ink-soft">No salary-related warning signs detected.</p> : (
                <ul className="space-y-2 text-sm">
                  {result.warnings.map((w, i) => (
                    <li key={i}>
                      <span className={`font-semibold uppercase ${SEV[w.severity]}`}>{w.severity}:</span> {w.message}
                      {w.evidence ? <span className="block text-xs italic text-ink-soft">“{w.evidence}”</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted">
                {result.limitations.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
