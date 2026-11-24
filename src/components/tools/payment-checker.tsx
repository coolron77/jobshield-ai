"use client";

import { useState } from "react";
import type { PaymentCheckResult } from "@/lib/analysis/payment";
import { api, ApiError } from "@/lib/api-client";
import { Alert, Button, Card, CardBody, CardHeader, FieldError, Label, Spinner, Textarea } from "@/components/ui/primitives";
import { WalletIcon } from "@/components/ui/icons";
import { SeverityBadge } from "@/components/ui/risk";

export function PaymentChecker() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentCheckResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 20) return setError("Paste at least 20 characters.");
    setBusy(true);
    setError(null);
    try {
      setResult(await api<PaymentCheckResult>("/api/tools/payment", { body: { text } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const tone = result?.verdict === "payment_requested" ? "danger" : result?.verdict === "payment_mentioned" ? "warning" : "success";
  return (
    <div className="space-y-6">
      <form onSubmit={submit} noValidate>
        <Card>
          <CardBody className="space-y-4">
            <div>
              <Label htmlFor="pay-text">Ad text or recruiter message</Label>
              <Textarea id="pay-text" rows={8} value={text} maxLength={15000} onChange={(e) => setText(e.target.value)} aria-invalid={!!error} aria-describedby="pay-error" />
              <FieldError id="pay-error" message={error} />
            </div>
            <Button type="submit" disabled={busy}>{busy ? <><Spinner label="Checking" /> Checking…</> : <><WalletIcon className="h-4 w-4" /> Check for payment requests</>}</Button>
          </CardBody>
        </Card>
      </form>
      {result ? (
        <>
          <Alert tone={tone} title={result.verdict === "payment_requested" ? "Payment requested" : result.verdict === "payment_mentioned" ? "Payment mentioned" : "No payment request detected"}>
            {result.message}
          </Alert>
          {result.findings.length ? (
            <Card>
              <CardHeader title="What we found" />
              <CardBody>
                <ul className="space-y-3">
                  {result.findings.map((f, i) => (
                    <li key={i} className="rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={f.severity} /><span className="font-semibold">{f.label}</span></div>
                      <p className="mt-2 text-sm italic text-ink">“{f.evidence_quote}”</p>
                      <p className="mt-2 text-sm text-ink-soft">{f.why}</p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {result.caveats.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </>
      ) : null}
    </div>
  );
}
