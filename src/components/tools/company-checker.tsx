"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { CompanyCheckResult } from "@/lib/company/check";
import { api, ApiError } from "@/lib/api-client";
import { Alert, Button, Card, CardBody, CardHeader, FieldError, FieldHint, Input, Label, Spinner, Textarea } from "@/components/ui/primitives";
import { AlertIcon, BuildingIcon, CheckIcon, InfoIcon } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/utils";

const Schema = z.object({
  company_name: z.string().trim().min(2, "Enter the company name.").max(200),
  website: z.string().trim().max(2048),
  recruiter_email: z.string().trim().max(320).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address."),
  recruiter_domain: z.string().trim().max(253),
  other_info: z.string().trim().max(1000),
});
type Values = z.infer<typeof Schema>;

const OBS_STYLE = {
  warning: { cls: "border-[#f3c3c8] bg-risk-critical-bg text-risk-critical", Icon: AlertIcon, label: "Warning" },
  caution: { cls: "border-[#f5d9a0] bg-risk-medium-bg text-risk-medium", Icon: AlertIcon, label: "Caution" },
  info: { cls: "border-brand-200 bg-brand-50 text-brand-800", Icon: InfoIcon, label: "Note" },
} as const;

export function CompanyChecker() {
  const [result, setResult] = useState<CompanyCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: { company_name: "", website: "", recruiter_email: "", recruiter_domain: "", other_info: "" },
  });

  async function onSubmit(v: Values) {
    setError(null);
    setResult(null);
    try {
      setResult(await api<CompanyCheckResult>("/api/tools/company", { body: v }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="company_name">Company name</Label>
              <Input id="company_name" aria-invalid={!!formState.errors.company_name} aria-describedby="cn-error" {...register("company_name")} />
              <FieldError id="cn-error" message={formState.errors.company_name?.message} />
            </div>
            <div>
              <Label htmlFor="website">Official website <span className="font-normal text-muted">(if known)</span></Label>
              <Input id="website" inputMode="url" placeholder="https://company.com" {...register("website")} />
              <FieldHint>Find it yourself via a search engine rather than copying the link from the ad.</FieldHint>
            </div>
            <div>
              <Label htmlFor="recruiter_email">Recruiter email</Label>
              <Input id="recruiter_email" type="email" aria-invalid={!!formState.errors.recruiter_email} aria-describedby="re-error" {...register("recruiter_email")} />
              <FieldError id="re-error" message={formState.errors.recruiter_email?.message} />
            </div>
            <div>
              <Label htmlFor="recruiter_domain">Recruiter domain <span className="font-normal text-muted">(optional)</span></Label>
              <Input id="recruiter_domain" placeholder="company-careers.com" {...register("recruiter_domain")} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="other_info">Other information <span className="font-normal text-muted">(optional, not verified)</span></Label>
              <Textarea id="other_info" rows={3} placeholder="e.g. claimed office address, LinkedIn page, registration number quoted in the ad" {...register("other_info")} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? <><Spinner label="Checking" /> Checking…</> : <><BuildingIcon className="h-4 w-4" /> Run checks</>}
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {result ? (
        <div className="space-y-6">
          <Card>
            <CardHeader title="What JobShield checked" description="Facts we looked up ourselves, with source and time." />
            <CardBody>
              {result.checked.length === 0 ? (
                <p className="text-sm text-ink-soft">Nothing could be checked online with the information provided.</p>
              ) : (
                <ul className="space-y-3">
                  {result.checked.map((c, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      <div className="min-w-0">
                        <p><span className="font-semibold">{c.label}:</span> <span className="break-words text-ink-soft">{c.value}</span></p>
                        <p className="break-all text-xs text-muted">Source: {c.source} · {formatDateTime(c.checked_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {result.observations.length ? (
            <Card>
              <CardHeader title="Observations" description="Comparisons and cautions based on the checks above." />
              <CardBody className="space-y-2">
                {result.observations.map((o, i) => {
                  const st = OBS_STYLE[o.severity];
                  return (
                    <p key={i} className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${st.cls}`}>
                      <st.Icon className="mt-0.5 h-4 w-4 shrink-0" title={st.label} />
                      <span className="text-ink">{o.message}</span>
                    </p>
                  );
                })}
              </CardBody>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="What you told us" description="User-provided claims — not verified." />
              <CardBody>
                <dl className="space-y-2 text-sm">
                  {result.claims.map((c, i) => (
                    <div key={i}><dt className="font-medium text-muted">{c.label}</dt><dd className="break-words">{c.value}</dd></div>
                  ))}
                </dl>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Not verified" description="JobShield did not check these." />
              <CardBody>
                <ul className="space-y-2 text-sm">
                  {result.not_checked.map((n, i) => (
                    <li key={i}><span className="font-semibold">{n.label}.</span> <span className="text-ink-soft">{n.detail}</span></li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Check official company registries yourself" />
            <CardBody>
              <ul className="space-y-1.5 text-sm">
                {result.official_registries.map((r) => (
                  <li key={r.url}>
                    <a className="font-medium text-brand-700 hover:underline" href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a>
                    <span className="text-muted"> — {r.region}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">Domain checks are not legal company verification. A real company name can be used by impostors.</p>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
