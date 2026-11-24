import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/analysis/schema";
import type { ScanRow } from "@/lib/db/types";
import { UUID_RE } from "@/lib/security/http";
import { requirePageContext } from "@/server/session";
import { Alert, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Select } from "@/components/ui/primitives";
import { CompareIcon } from "@/components/ui/icons";
import { ModeBadge, RiskBadge, RiskGauge, SeverityBadge } from "@/components/ui/risk";
import { SaveComparisonButton, DeleteComparisonButton } from "@/components/scan/comparison-buttons";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Compare opportunities" };

function categoryCounts(scan: ScanRow) {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<(typeof CATEGORIES)[number], number>;
  for (const f of scan.analysis.findings) if (!f.missing_info && f.counted) counts[f.category]++;
  return counts;
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  const { ctx, session } = await requirePageContext("/compare");
  const [{ items }, saved] = await Promise.all([
    ctx.scans.list({ ownerId: session.user.id, limit: 100, offset: 0 }),
    ctx.comparisons.list(session.user.id),
  ]);
  const validA = a && UUID_RE.test(a) ? a : undefined;
  const validB = b && UUID_RE.test(b) ? b : undefined;
  const [scanA, scanB] = await Promise.all([validA ? ctx.scans.get(validA, session.user.id) : null, validB ? ctx.scans.get(validB, session.user.id) : null]);
  const both = scanA && scanB && scanA.id !== scanB.id ? ([scanA, scanB] as const) : null;
  const alreadySaved = both ? saved.some((c) => c.scan_a_id === both[0].id && c.scan_b_id === both[1].id) : false;

  return (
    <>
      <PageHeader title="Compare opportunities" description="Put two scanned ads side by side to compare their warning signs and missing information." actions={<ButtonLink href="/scan" variant="outline">Analyse a new ad</ButtonLink>} />

      {items.length < 2 ? (
        <Card>
          <EmptyState icon={<CompareIcon />} title="You need at least two scans to compare" description="Scan two job ads, then come back here." action={<ButtonLink href="/scan">Scan a job ad</ButtonLink>} />
        </Card>
      ) : (
        <Card>
          <form action="/compare" className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-5">
            {(["a", "b"] as const).map((key, i) => (
              <div key={key}>
                <label htmlFor={`select-${key}`} className="text-sm font-semibold">Opportunity {i === 0 ? "A" : "B"}</label>
                <Select id={`select-${key}`} name={key} defaultValue={(key === "a" ? validA : validB) ?? ""} required>
                  <option value="" disabled>Choose a scan…</option>
                  {items.map((s) => (
                    <option key={s.id} value={s.id}>{s.title} ({s.risk_score}, {formatDate(s.created_at)})</option>
                  ))}
                </Select>
              </div>
            ))}
            <button type="submit" className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700" data-testid="compare-submit">
              Compare
            </button>
          </form>
        </Card>
      )}

      {(validA || validB) && !both ? (
        <Alert tone="warning" className="mt-4">Choose two different scans from your history to compare.</Alert>
      ) : null}

      {both ? (
        <section aria-label="Comparison" className="mt-6 space-y-6" data-testid="comparison">
          <div className="flex justify-end no-print">
            <SaveComparisonButton a={both[0].id} b={both[1].id} saved={alreadySaved} />
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {both.map((s, i) => (
              <Card key={s.id}>
                <CardHeader title={<Link href={`/scans/${s.id}`} className="hover:underline">{`${i === 0 ? "A" : "B"}: ${s.title}`}</Link>} description={s.company_name ?? undefined} />
                <CardBody className="flex items-center gap-4">
                  <RiskGauge score={s.risk_score} level={s.risk_level} size={104} />
                  <div className="space-y-2">
                    <RiskBadge level={s.risk_level} />
                    <div><ModeBadge mode={s.analysis_mode} model={s.model} /></div>
                    <p className="text-sm text-ink-soft">{s.analysis.findings.filter((f) => !f.missing_info).length} warning signs · {s.analysis.missing_information.length} missing details</p>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader title="Warning signs by category" description="Counted findings per category." />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="px-5 py-2 font-semibold">Category</th>
                    <th scope="col" className="px-5 py-2 text-center font-semibold">A</th>
                    <th scope="col" className="px-5 py-2 text-center font-semibold">B</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(() => {
                    const ca = categoryCounts(both[0]);
                    const cb = categoryCounts(both[1]);
                    return CATEGORIES.filter((c) => ca[c] || cb[c]).map((c) => (
                      <tr key={c}>
                        <th scope="row" className="px-5 py-2 text-left font-medium">{CATEGORY_LABELS[c]}</th>
                        <td className={`px-5 py-2 text-center tabular-nums ${ca[c] > cb[c] ? "font-bold text-risk-critical" : ""}`}>{ca[c]}</td>
                        <td className={`px-5 py-2 text-center tabular-nums ${cb[c] > ca[c] ? "font-bold text-risk-critical" : ""}`}>{cb[c]}</td>
                      </tr>
                    ));
                  })()}
                  <tr>
                    <th scope="row" className="px-5 py-2 text-left font-medium">Missing information</th>
                    <td className="px-5 py-2 text-center tabular-nums">{both[0].analysis.missing_information.length}</td>
                    <td className="px-5 py-2 text-center tabular-nums">{both[1].analysis.missing_information.length}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-5 py-2 text-left font-medium">Positive signals</th>
                    <td className="px-5 py-2 text-center tabular-nums">{both[0].analysis.positive_signals.length}</td>
                    <td className="px-5 py-2 text-center tabular-nums">{both[1].analysis.positive_signals.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {both.map((s, i) => (
              <Card key={s.id}>
                <CardHeader title={`Top warning signs — ${i === 0 ? "A" : "B"}`} />
                <CardBody className="space-y-3">
                  {s.analysis.findings.filter((f) => !f.missing_info).slice(0, 5).map((f) => (
                    <div key={f.id} className="rounded-lg border border-line p-3">
                      <SeverityBadge severity={f.severity} />
                      <p className="mt-1.5 text-sm font-medium">{f.title}</p>
                      {f.evidence_quote ? <p className="mt-1 text-xs italic text-ink-soft">“{f.evidence_quote}”</p> : null}
                    </div>
                  ))}
                  {s.analysis.findings.filter((f) => !f.missing_info).length === 0 ? <p className="text-sm text-ink-soft">No warning signs detected.</p> : null}
                  {s.analysis.missing_information.length ? (
                    <div>
                      <p className="text-sm font-semibold">Missing information</p>
                      <ul className="mt-1 list-disc pl-5 text-sm text-ink-soft">
                        {s.analysis.missing_information.slice(0, 5).map((m, j) => <li key={j}>{m}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted">A lower score means fewer detected warning signs, not that an opportunity is verified. Check both employers independently.</p>
        </section>
      ) : null}

      <Card className="mt-8">
        <CardHeader title="Saved comparisons" />
        {saved.length === 0 ? (
          <CardBody><p className="text-sm text-ink-soft">No saved comparisons yet.</p></CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {saved.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <Link href={`/compare?a=${c.scan_a_id}&b=${c.scan_b_id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                  {c.scan_a_title ?? "Scan"} <span className="text-muted">vs</span> {c.scan_b_title ?? "Scan"}
                </Link>
                <span className="text-xs text-muted">{formatDate(c.created_at)}</span>
                <DeleteComparisonButton id={c.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
