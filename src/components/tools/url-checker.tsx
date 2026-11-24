"use client";

import Link from "next/link";
import { useState } from "react";
import type { UrlInspection } from "@/lib/url/inspect";
import { api, ApiError } from "@/lib/api-client";
import { Alert, Button, ButtonLink, Card, CardBody, CardHeader, FieldError, FieldHint, Input, Label, Spinner } from "@/components/ui/primitives";
import { InfoIcon, LinkIcon } from "@/components/ui/icons";
import { SeverityBadge } from "@/components/ui/risk";
import { formatDateTime } from "@/lib/utils";

export function UrlChecker() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UrlInspection | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (url.trim().length < 4) return setError("Enter a link to check.");
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api<UrlInspection>("/api/tools/url", { body: { url } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const s = result?.summary;
  return (
    <div className="space-y-6">
      <form onSubmit={submit} noValidate>
        <Card>
          <CardBody className="space-y-4">
            <div>
              <Label htmlFor="url">Job link</Label>
              <Input id="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-invalid={!!error} aria-describedby="url-hint url-error" />
              <FieldHint id="url-hint">The page is fetched by our server with strict safety limits. It is never opened in your browser and no scripts are run.</FieldHint>
              <FieldError id="url-error" message={error} />
            </div>
            <Button type="submit" disabled={busy}>{busy ? <><Spinner label="Checking link" /> Checking…</> : <><LinkIcon className="h-4 w-4" /> Check link</>}</Button>
          </CardBody>
        </Card>
      </form>

      {s ? (
        <Card>
          <CardHeader title="Link details" description={`Retrieved ${formatDateTime(s.retrieved_at)}`} />
          <CardBody className="space-y-4 text-sm">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
              <dt className="font-medium text-muted">Submitted</dt>
              <dd className="break-all font-mono text-xs">{s.submitted_url}</dd>
              <dt className="font-medium text-muted">Domain</dt>
              <dd className="font-semibold">{s.domain ?? "—"}</dd>
              <dt className="font-medium text-muted">Final destination</dt>
              <dd className="break-all font-mono text-xs">{s.final_url ?? "—"}</dd>
              <dt className="font-medium text-muted">Redirects</dt>
              <dd>
                {s.redirects.length === 0 ? "None" : (
                  <ol className="list-decimal space-y-1 pl-5 font-mono text-xs">
                    {s.redirects.map((r, i) => <li key={i} className="break-all">{r}</li>)}
                  </ol>
                )}
              </dd>
              <dt className="font-medium text-muted">Page</dt>
              <dd>{s.fetched ? `HTTP ${s.status}${result.contentType ? `, ${result.contentType}` : ""}${result.title ? ` — “${result.title}”` : ""}` : `Not retrieved: ${s.error}`}</dd>
            </dl>
            {s.notes.length ? (
              <div className="space-y-2">
                {s.notes.map((n, i) => <p key={i} className="flex gap-2 text-ink-soft"><InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{n}</p>)}
              </div>
            ) : null}
            {result.jobPosting ? (
              <div className="rounded-xl border border-line bg-canvas p-4">
                <p className="font-semibold">Structured job data published by the page</p>
                <p className="text-xs text-muted">As provided by the page (schema.org JobPosting) — not verified.</p>
                <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[10rem_1fr]">
                  {([["Title", result.jobPosting.title], ["Hiring organisation", result.jobPosting.hiringOrganization], ["Organisation link", result.jobPosting.organizationUrl], ["Location", result.jobPosting.location], ["Salary", result.jobPosting.salary], ["Posted", result.jobPosting.datePosted], ["Valid through", result.jobPosting.validThrough]] as const)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-all">{v}</dd></div>
                    ))}
                </dl>
              </div>
            ) : null}
            {s.fetched ? (
              result.findings.length ? (
                <div>
                  <p className="font-semibold">Warning signs in the page text</p>
                  <ul className="mt-2 space-y-2">
                    {result.findings.slice(0, 8).map((f, i) => (
                      <li key={i} className="rounded-lg border border-line p-3">
                        <SeverityBadge severity={f.severity} /> <span className="ml-1 font-medium">{f.title}</span>
                        <p className="mt-1 text-xs italic text-ink-soft">“{f.evidence_quote}”</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-ink-soft">No rule-based warning signs found in the readable page text{result.truncated ? " (page was truncated)" : ""}.</p>
              )
            ) : (
              <Alert tone="info">Safe inspection wasn&apos;t possible for this link. You can still <Link href="/scan">paste the ad text</Link> for a full analysis.</Alert>
            )}
            {s.fetched ? (
              <ButtonLink href={`/scan?url=${encodeURIComponent(s.submitted_url)}`} variant="secondary">Run a full AI scan of this link</ButtonLink>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
