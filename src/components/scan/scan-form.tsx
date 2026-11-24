"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, ApiError } from "@/lib/api-client";
import { containsSensitiveData } from "@/lib/analysis/redact";
import { INPUT_LIMITS } from "@/lib/analysis/pipeline";
import { SAMPLE_ADS } from "@/lib/samples";
import { Alert, Button, Card, CardBody, FieldError, FieldHint, Input, Label, Spinner, Textarea } from "@/components/ui/primitives";
import { LockIcon, SearchIcon } from "@/components/ui/icons";

const FormSchema = z
  .object({
    text: z.string().max(INPUT_LIMITS.maxChars, `Up to ${INPUT_LIMITS.maxChars.toLocaleString("en")} characters.`),
    url: z
      .string()
      .trim()
      .max(2048)
      .refine((v) => !v || /^(https?:\/\/)?[^\s/]+\.[^\s]+$/i.test(v), "Enter a valid link, e.g. https://example.com/job/123"),
    company_name: z.string().trim().max(200),
  })
  .refine((v) => v.url || v.text.trim().length >= INPUT_LIMITS.minChars, {
    message: `Paste at least ${INPUT_LIMITS.minChars} characters of the ad, or add a job link.`,
    path: ["text"],
  });
type FormValues = z.infer<typeof FormSchema>;

const STAGES = ["Removing sensitive numbers…", "Running rule-based checks…", "Asking Claude to review the ad…", "Verifying every quote against your text…", "Calculating the score…"];

export function ScanForm({ initialUrl = "" }: { initialUrl?: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<{ message: string; retry: boolean } | null>(null);
  const [stage, setStage] = useState(0);
  const { register, handleSubmit, formState, setValue, control, setError } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { text: "", url: initialUrl, company_name: "" },
  });
  const text = useWatch({ control, name: "text" });
  const sensitive = text.length > 0 && containsSensitiveData(text);

  // Progress text while the (real) request is in flight.
  useEffect(() => {
    if (!formState.isSubmitting) return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2500);
    return () => {
      clearInterval(t);
      setStage(0);
    };
  }, [formState.isSubmitting]);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const res = await api<{ id: string }>("/api/scans", {
        body: { text: values.text, url: values.url || undefined, company_name: values.company_name || undefined },
      });
      router.push(`/scans/${res.id}`);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError) {
        for (const [field, message] of Object.entries(e.fields)) {
          if (field === "text" || field === "url" || field === "company_name") setError(field, { message });
        }
        const retry = e.status === 0 || e.status >= 500 || e.status === 429;
        setServerError({ message: e.status === 429 && e.retryAfter ? `${e.message} (try again in about ${Math.ceil(e.retryAfter / 60)} min)` : e.message, retry });
      } else {
        setServerError({ message: "Something went wrong. Please try again.", retry: true });
      }
    }
  }

  function loadSample(id: string) {
    const s = SAMPLE_ADS.find((x) => x.id === id);
    if (!s) return;
    setValue("text", s.text, { shouldValidate: true });
    setValue("company_name", s.companyName);
    setValue("url", "");
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-6" aria-busy={formState.isSubmitting}>
      <Card>
        <CardBody className="space-y-5">
          <div>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="text">Job or internship description</Label>
              <span className="text-xs tabular-nums text-muted" aria-live="polite">
                {text.length.toLocaleString("en")} / {INPUT_LIMITS.maxChars.toLocaleString("en")}
              </span>
            </div>
            <Textarea
              id="text"
              rows={12}
              placeholder="Paste the full ad here — including any contact details, fees, or instructions it mentions."
              aria-invalid={!!formState.errors.text}
              aria-describedby="text-hint text-error"
              {...register("text")}
            />
            <FieldHint id="text-hint">The text is analysed as data only. Any instructions hidden inside it are ignored.</FieldHint>
            <FieldError id="text-error" message={formState.errors.text?.message} />
          </div>

          {sensitive ? (
            <Alert tone="warning" title="This looks like it contains personal or financial numbers">
              Card, bank, ID, password or one-time-code values will be removed automatically before analysis and storage. Please don&apos;t paste your own passwords or ID numbers.
            </Alert>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="url">Job link <span className="font-normal text-muted">(optional)</span></Label>
              <Input id="url" inputMode="url" placeholder="https://…" aria-invalid={!!formState.errors.url} aria-describedby="url-hint url-error" {...register("url")} />
              <FieldHint id="url-hint">We fetch it safely on our server and include readable page text.</FieldHint>
              <FieldError id="url-error" message={formState.errors.url?.message} />
            </div>
            <div>
              <Label htmlFor="company_name">Company name <span className="font-normal text-muted">(optional)</span></Label>
              <Input id="company_name" placeholder="As stated in the ad" aria-describedby="company-error" {...register("company_name")} />
              <FieldError id="company-error" message={formState.errors.company_name?.message} />
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">Try a sample ad</p>
            <p className="text-xs text-muted">Fictional examples for demonstration.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SAMPLE_ADS.map((s) => (
                <Button key={s.id} variant="secondary" size="sm" onClick={() => loadSample(s.id)} data-testid={`sample-${s.id}`}>
                  {s.label.replace(/^Sample: /, "")}
                </Button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {serverError ? (
        <Alert tone="danger" title="We couldn't complete the scan">
          <p>{serverError.message}</p>
          {serverError.retry ? (
            <Button type="submit" variant="outline" size="sm" className="mt-2">
              Try again
            </Button>
          ) : null}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm text-muted">
          <LockIcon className="h-4 w-4 shrink-0" /> Scans are private to your account. You can delete them at any time.
        </p>
        <Button type="submit" size="lg" disabled={formState.isSubmitting} data-testid="scan-submit">
          {formState.isSubmitting ? (
            <>
              <Spinner label="Analysing" /> Analysing…
            </>
          ) : (
            <>
              <SearchIcon className="h-5 w-5" /> Analyse this ad
            </>
          )}
        </Button>
      </div>
      {formState.isSubmitting ? (
        <p role="status" aria-live="polite" className="text-right text-sm text-ink-soft">
          {STAGES[stage]} This usually takes 10–30 seconds.
        </p>
      ) : null}
    </form>
  );
}
