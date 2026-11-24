"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, ApiError } from "@/lib/api-client";
import { containsSensitiveData } from "@/lib/analysis/redact";
import { Alert, Button, Card, CardBody, FieldError, FieldHint, Input, Label, Textarea } from "@/components/ui/primitives";
import { REPORTING_GUIDELINES } from "./guidelines";

const Schema = z.object({
  company_name: z.string().trim().min(2, "Enter the company or recruiter organisation name.").max(200),
  opportunity_title: z.string().trim().max(200),
  opportunity_url: z.string().trim().max(2048).refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "Enter a full http(s) link."),
  contact_channel: z.string().trim().max(200),
  description: z.string().trim().min(30, "Describe what happened in at least 30 characters.").max(4000),
  evidence_excerpt: z.string().trim().max(1500),
  accept_guidelines: z.boolean().refine((v) => v, "Please confirm the reporting guidelines."),
});
type Values = z.infer<typeof Schema>;

export function ReportForm({ scan }: { scan: { id: string; company_name: string | null; title: string; excerpt: string | null; url: string | null } | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const { register, handleSubmit, formState, control, setError: setFieldError } = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: {
      company_name: scan?.company_name ?? "",
      opportunity_title: scan?.title ?? "",
      opportunity_url: scan?.url ?? "",
      contact_channel: "",
      description: "",
      evidence_excerpt: scan?.excerpt ?? "",
      accept_guidelines: false,
    },
  });
  const desc = useWatch({ control, name: "description" });
  const excerpt = useWatch({ control, name: "evidence_excerpt" });
  const sensitive = containsSensitiveData(`${desc}\n${excerpt}`);

  async function onSubmit(v: Values) {
    setError(null);
    try {
      await api("/api/reports", {
        body: {
          company_name: v.company_name,
          opportunity_title: v.opportunity_title || undefined,
          opportunity_url: v.opportunity_url || undefined,
          contact_channel: v.contact_channel || undefined,
          description: v.description,
          evidence_excerpt: v.evidence_excerpt || undefined,
          scan_id: scan?.id,
          accept_guidelines: v.accept_guidelines,
        },
      });
      setSubmitted(true);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError) {
        for (const [f, m] of Object.entries(e.fields)) if (f in Schema.shape) setFieldError(f as keyof Values, { message: m });
        setError(e.message);
      } else setError("Something went wrong. Please try again.");
    }
  }

  if (submitted) {
    return (
      <Alert tone="success" title="Thank you — your report was submitted">
        It&apos;s now awaiting moderator review and is visible only to you until it&apos;s published. You can withdraw it from the <a href="/community">community page</a>.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <p className="text-sm font-semibold">Before you start</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {REPORTING_GUIDELINES.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="company_name">Company named in the offer</Label>
            <Input id="company_name" aria-invalid={!!formState.errors.company_name} aria-describedby="cn-err" {...register("company_name")} />
            <FieldError id="cn-err" message={formState.errors.company_name?.message} />
          </div>
          <div>
            <Label htmlFor="opportunity_title">Job title <span className="font-normal text-muted">(optional)</span></Label>
            <Input id="opportunity_title" {...register("opportunity_title")} />
          </div>
          <div>
            <Label htmlFor="opportunity_url">Link to the ad <span className="font-normal text-muted">(optional)</span></Label>
            <Input id="opportunity_url" inputMode="url" aria-invalid={!!formState.errors.opportunity_url} aria-describedby="url-err" {...register("opportunity_url")} />
            <FieldHint>Only the link&apos;s domain is shown publicly.</FieldHint>
            <FieldError id="url-err" message={formState.errors.opportunity_url?.message} />
          </div>
          <div>
            <Label htmlFor="contact_channel">How were you contacted? <span className="font-normal text-muted">(optional)</span></Label>
            <Input id="contact_channel" placeholder="e.g. WhatsApp, Gmail address, Telegram group" {...register("contact_channel")} />
            <FieldHint>Describe the channel, not a person&apos;s name or phone number.</FieldHint>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">What happened?</Label>
            <Textarea id="description" rows={6} aria-invalid={!!formState.errors.description} aria-describedby="desc-err" {...register("description")} />
            <FieldError id="desc-err" message={formState.errors.description?.message} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="evidence_excerpt">Short excerpt from the ad <span className="font-normal text-muted">(optional, max 1,500 characters)</span></Label>
            <Textarea id="evidence_excerpt" rows={3} maxLength={1500} {...register("evidence_excerpt")} />
            <FieldHint>Quote only the relevant sentence — never the full advertisement.</FieldHint>
          </div>
          {sensitive ? (
            <Alert tone="warning" className="sm:col-span-2" title="Remove personal numbers">This text seems to contain an ID, bank, card or phone number. Please remove it before submitting.</Alert>
          ) : null}
          <div className="sm:col-span-2">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4 rounded border-line" aria-describedby="g-err" {...register("accept_guidelines")} />
              <span>I confirm this is my own experience, contains no personal information about individuals, and follows the reporting guidelines.</span>
            </label>
            <FieldError id="g-err" message={formState.errors.accept_guidelines?.message} />
          </div>
        </CardBody>
      </Card>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={formState.isSubmitting}>{formState.isSubmitting ? "Submitting…" : "Submit for review"}</Button>
      </div>
    </form>
  );
}
