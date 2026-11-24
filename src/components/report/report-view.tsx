import { CATEGORY_LABELS, type Report } from "@/lib/analysis/schema";
import { Alert, Card, CardBody, CardHeader, Disclaimer } from "@/components/ui/primitives";
import { CheckIcon, InfoIcon, LinkIcon, ShieldIcon } from "@/components/ui/icons";
import { LEVEL_META, ModeBadge, RiskBadge, RiskGauge, SeverityBadge } from "@/components/ui/risk";
import { formatDateTime } from "@/lib/utils";
import { HighlightedText } from "./highlighted-text";

const REDACTION_LABELS: Record<string, string> = {
  card_number: "card number",
  bank_account: "bank account number",
  iban: "IBAN",
  ifsc: "IFSC code",
  upi_id: "UPI ID",
  government_id: "ID number",
  password: "password",
  otp: "one-time code",
  phone: "phone number",
};

export function ReportView({ report, text }: { report: Report; text: string | null }) {
  const level = LEVEL_META[report.risk_level];
  const warnings = report.findings.filter((f) => !f.missing_info);
  const missingFinding = report.findings.find((f) => f.missing_info);

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ verdict */}
      <Card className={`print-break-avoid border-2 ${level.ring}`}>
        <CardBody className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <RiskGauge score={report.risk_score} level={report.risk_level} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <RiskBadge level={report.risk_level} />
              <ModeBadge mode={report.mode} model={report.model} />
              <span className="text-xs text-muted">Generated {formatDateTime(report.generated_at)}</span>
            </div>
            <p className="text-[15px] leading-relaxed text-ink" data-testid="report-summary">
              {report.summary}
            </p>
            <div className={`rounded-xl ${level.bg} px-4 py-3`}>
              <p className={`text-sm font-semibold ${level.text}`}>Recommended next step</p>
              <p className="mt-0.5 text-sm text-ink">{report.recommendation}</p>
              {report.ai_note ? <p className="mt-2 text-sm text-ink-soft"><span className="font-medium">Claude&apos;s note:</span> {report.ai_note}</p> : null}
            </div>
          </div>
        </CardBody>
      </Card>

      {report.mode === "rules_only" ? (
        <Alert tone="info" title="Rule-based analysis">
          This report was produced by JobShield&apos;s deterministic checks only, without Claude. It may miss context-dependent warning signs.
        </Alert>
      ) : null}
      {report.mode === "mock" ? (
        <Alert tone="warning" title="Test mode">
          This report was produced by a mock analyzer used for automated testing. It is not a real AI analysis.
        </Alert>
      ) : null}
      {report.injection_attempt_detected ? (
        <Alert tone="danger" title="The ad tried to manipulate automated screening">
          It contains instructions aimed at AI tools (for example, asking to be rated as safe). JobShield ignored them. Legitimate employers have no reason to do this.
        </Alert>
      ) : null}

      {/* ------------------------------------------------ score breakdown */}
      <Card className="print-break-avoid">
        <CardHeader title="Why this score?" description="The score counts detected warning signs. It is not a probability that the posting is fraudulent." />
        <CardBody>
          {report.score_breakdown.contributions.length === 0 ? (
            <p className="text-sm text-ink-soft">No warning signs contributed to the score.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Score contributions</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="pb-2 font-semibold">Warning sign</th>
                  <th scope="col" className="hidden pb-2 font-semibold sm:table-cell">Severity × confidence</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.score_breakdown.contributions.map((c) => (
                  <tr key={c.finding_id}>
                    <td className="py-2 pr-2">
                      <a href={`#finding-${c.finding_id}`} className="font-medium text-ink hover:underline">{c.label}</a>
                    </td>
                    <td className="hidden py-2 text-ink-soft sm:table-cell">
                      {LEVEL_META[c.severity].label} × {Math.round(c.confidence * 100)}%
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">{c.points}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line">
                  <td className="pt-2 font-semibold">Total (capped at 100)</td>
                  <td className="hidden sm:table-cell" />
                  <td className="pt-2 text-right font-bold tabular-nums">{report.risk_score}</td>
                </tr>
              </tfoot>
            </table>
          )}
          {report.score_breakdown.floor_applied ? <p className="mt-3 text-sm text-ink-soft">{report.score_breakdown.floor_applied}</p> : null}
          <details className="mt-4 text-sm text-ink-soft">
            <summary className="cursor-pointer font-medium text-brand-700">How scoring works</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Each warning sign earns points: critical 40, high 25, medium 12, low 5 — multiplied by confidence.</li>
              <li>The same behaviour is counted once, even if it appears several times or is found by both the rules and Claude.</li>
              <li>Within a category, each extra sign counts half as much as the previous one.</li>
              <li>Missing information adds at most 10 points in total — it is a reason to verify, not proof of fraud.</li>
              <li>A confident critical sign sets a minimum of 60; a confident high sign a minimum of 30.</li>
              <li>Bands: 0–24 Low, 25–49 Medium, 50–74 High, 75–100 Critical.</li>
            </ul>
          </details>
        </CardBody>
      </Card>

      {/* ------------------------------------------------ findings */}
      <Card>
        <CardHeader title={`Warning signs (${warnings.length})`} description="Each finding quotes the exact text it is based on." />
        <CardBody className="space-y-4">
          {warnings.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <CheckIcon className="h-4 w-4 text-risk-low" /> No warning signs were detected in this text.
            </p>
          ) : (
            <ol className="space-y-4">
              {warnings.map((f) => (
                <li key={f.id} id={`finding-${f.id}`} className="print-break-avoid scroll-mt-24 rounded-xl border border-line p-4" data-testid="finding">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <span className="text-xs font-medium text-muted">{CATEGORY_LABELS[f.category]}</span>
                    <span className="text-xs text-muted">· Confidence {Math.round(f.confidence * 100)}%</span>
                    <span className="text-xs text-muted">· {f.source === "rule" ? "Rule" : f.source === "ai" ? "Claude" : "Rule + Claude"}</span>
                    {!f.counted ? <span className="text-xs text-muted">· Not counted (low confidence)</span> : null}
                  </div>
                  <h3 className="mt-2 font-semibold text-ink">{f.title}</h3>
                  {f.evidence_quote ? (
                    <blockquote className="mt-2 border-l-4 pl-3 text-sm italic text-ink" style={{ borderLeftColor: LEVEL_META[f.severity].stroke }}>
                      “{f.evidence_quote}”
                    </blockquote>
                  ) : null}
                  <p className="mt-2 text-sm text-ink-soft">{f.explanation}</p>
                  {f.recommended_action ? (
                    <p className="mt-2 text-sm">
                      <span className="font-semibold text-ink">What to do: </span>
                      <span className="text-ink-soft">{f.recommended_action}</span>
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      {/* ------------------------------------------------ highlighted text */}
      {text ? (
        <Card className="print-break-avoid">
          <CardHeader title="The advertisement, with evidence highlighted" description="Sensitive identifiers were removed before analysis." />
          <CardBody>
            <HighlightedText text={text} findings={warnings} />
          </CardBody>
        </Card>
      ) : (
        <Alert tone="info">The original text was not stored (your privacy setting). Evidence quotes above are kept with the report.</Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="print-break-avoid">
          <CardHeader title="Positive signals" description="Credibility signals found in the text." />
          <CardBody>
            {report.positive_signals.length === 0 ? (
              <p className="text-sm text-ink-soft">None identified{report.mode === "rules_only" ? " (positive signals are identified by Claude)" : ""}.</p>
            ) : (
              <ul className="space-y-3">
                {report.positive_signals.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-risk-low" />
                    <span>
                      <span className="font-medium text-ink">{p.signal}</span>
                      <span className="block text-ink-soft italic">“{p.evidence_quote}”</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card className="print-break-avoid">
          <CardHeader title="Missing information" description="Details a genuine posting usually includes." />
          <CardBody>
            {report.missing_information.length === 0 ? (
              <p className="text-sm text-ink-soft">Nothing obvious is missing.</p>
            ) : (
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
                {report.missing_information.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}
            {missingFinding ? <p className="mt-3 text-xs text-muted">Missing details added {missingFinding.points} point(s) to the score.</p> : null}
          </CardBody>
        </Card>
      </div>

      <Card className="print-break-avoid">
        <CardHeader title="How to verify this opportunity" />
        <CardBody>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-soft">
            {report.verification_steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </CardBody>
      </Card>

      {report.url ? (
        <Card className="print-break-avoid">
          <CardHeader title="Link inspection" description={`Checked ${formatDateTime(report.url.retrieved_at)}`} />
          <CardBody className="space-y-2 text-sm">
            <p className="flex items-center gap-2 break-all">
              <LinkIcon className="h-4 w-4 shrink-0 text-muted" />
              <span className="text-ink-soft">Submitted:</span> <span className="font-mono text-xs">{report.url.submitted_url}</span>
            </p>
            {report.url.final_url && report.url.final_url !== report.url.submitted_url ? (
              <p className="break-all"><span className="text-ink-soft">Final destination:</span> <span className="font-mono text-xs">{report.url.final_url}</span></p>
            ) : null}
            {report.url.redirects.length ? <p className="text-ink-soft">{report.url.redirects.length} redirect(s) followed (each destination re-checked).</p> : null}
            <p className="text-ink-soft">
              {report.url.fetched ? `Page retrieved (HTTP ${report.url.status}); its text was included in the analysis.` : `Page not retrieved: ${report.url.error}`}
            </p>
            {report.url.notes.map((n, i) => (
              <p key={i} className="flex gap-2 text-ink-soft"><InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />{n}</p>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Card className="print-break-avoid">
        <CardHeader title="Limitations" />
        <CardBody className="space-y-3">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
            {report.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          {report.redactions.length ? (
            <p className="flex gap-2 text-sm text-ink-soft">
              <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              Removed before analysis: {report.redactions.map((r) => `${r.count} ${REDACTION_LABELS[r.type] ?? r.type}${r.count > 1 ? "s" : ""}`).join(", ")}.
            </p>
          ) : null}
          <Disclaimer />
        </CardBody>
      </Card>
    </div>
  );
}
