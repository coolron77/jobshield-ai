import type { Metadata } from "next";
import { UUID_RE } from "@/lib/security/http";
import { requirePageContext } from "@/server/session";
import { ReportForm } from "@/components/community/report-form";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Submit a community report" };

export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ scan?: string }> }) {
  const { scan: scanId } = await searchParams;
  const { ctx, session } = await requirePageContext("/community/new");
  const scan = scanId && UUID_RE.test(scanId) ? await ctx.scans.get(scanId, session.user.id) : null;
  // Pre-fill with the single strongest evidence quote — never the full ad text.
  const top = scan?.analysis.findings.find((f) => f.evidence_quote && !f.missing_info);
  return (
    <>
      <PageHeader title="Submit a community report" description="Help other job seekers by describing a suspicious opportunity you encountered. Reports are reviewed before they're published." />
      <ReportForm
        scan={scan ? { id: scan.id, company_name: scan.company_name, title: scan.title, excerpt: top?.evidence_quote.slice(0, 500) ?? null, url: scan.submitted_url } : null}
      />
    </>
  );
}
