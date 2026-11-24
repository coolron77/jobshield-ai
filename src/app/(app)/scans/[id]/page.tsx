import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UUID_RE } from "@/lib/security/http";
import { requirePageContext } from "@/server/session";
import { ReportView } from "@/components/report/report-view";
import { ReportActions } from "@/components/report/report-actions";
import { PageHeader } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Scan report" };

export default async function ScanReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { ctx, session } = await requirePageContext(`/scans/${id}`);
  // Owner-scoped query (and RLS): another user's scan id simply isn't found.
  const scan = await ctx.scans.get(id, session.user.id);
  if (!scan) notFound();

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted no-print">
        <Link href="/scans" className="hover:text-ink hover:underline">Scan history</Link> <span aria-hidden="true">/</span> Report
      </nav>
      <PageHeader
        title={scan.title}
        description={
          <>
            {scan.company_name ? <>Company named in the ad: <span className="font-medium text-ink">{scan.company_name}</span> · </> : null}
            Scanned {formatDateTime(scan.created_at)}
          </>
        }
        actions={<ReportActions report={scan.analysis} scanId={scan.id} title={scan.title} url={scan.submitted_url} createdAt={scan.created_at} />}
      />
      <ReportView report={scan.analysis} text={scan.input_text} />
    </>
  );
}
