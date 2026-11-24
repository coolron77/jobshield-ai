"use client";

import { useState } from "react";
import type { Report } from "@/lib/analysis/schema";
import { api, ApiError } from "@/lib/api-client";
import { SAMPLE_ADS } from "@/lib/samples";
import { INPUT_LIMITS } from "@/lib/analysis/pipeline";
import { ReportView } from "@/components/report/report-view";
import { Alert, Button, ButtonLink, Card, CardBody, FieldError, Label, Spinner, Textarea } from "@/components/ui/primitives";

export function DemoScanner() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ report: Report; analyzed_text: string } | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < INPUT_LIMITS.minChars) return setError(`Paste at least ${INPUT_LIMITS.minChars} characters of the ad.`);
    setBusy(true);
    setError(null);
    try {
      setResult(await api("/api/demo/scan", { body: { text } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} noValidate>
        <Card>
          <CardBody className="space-y-4">
            <div>
              <Label htmlFor="demo-text">Job advertisement</Label>
              <Textarea id="demo-text" rows={9} value={text} maxLength={INPUT_LIMITS.maxChars} onChange={(e) => setText(e.target.value)} aria-invalid={!!error} aria-describedby="demo-error" placeholder="Paste the ad here…" />
              <FieldError id="demo-error" message={error} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {SAMPLE_ADS.map((s) => (
                  <Button key={s.id} variant="secondary" size="sm" onClick={() => setText(s.text)}>
                    {s.label.replace(/^Sample: /, "Sample: ")}
                  </Button>
                ))}
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? <><Spinner label="Checking" /> Checking…</> : "Run quick check"}
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>
      {result ? (
        <>
          <Alert tone="info" title="Rule-based preview — not saved">
            For Claude&apos;s contextual analysis, saved history and comparisons, <ButtonLink href="/signup" variant="ghost" size="sm" className="h-auto px-1 underline">create a free account</ButtonLink>.
          </Alert>
          <ReportView report={result.report} text={result.analyzed_text} />
        </>
      ) : null}
    </div>
  );
}
