import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RISK_LEVELS } from "@/lib/analysis/schema";
import { MODERATION_STATUSES, type ModerationStatus } from "@/lib/db/types";
import { requirePageContext } from "@/server/session";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { UsersIcon } from "@/components/ui/icons";
import { LEVEL_META } from "@/components/ui/risk";
import { ModerationControls } from "@/components/admin/moderation-controls";
import { cn, domainOf, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const FILTERS: (ModerationStatus | "flagged")[] = ["pending", "flagged", ...MODERATION_STATUSES.filter((s) => s !== "pending")];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { ctx } = await requirePageContext("/admin");
  // Server-side authorisation from the database role. Non-admins get a 404 —
  // there is no hidden-link-only protection. The RPCs re-check is_admin().
  if (!(await ctx.isAdmin())) notFound();

  const { status: rawStatus } = await searchParams;
  const status = FILTERS.includes(rawStatus as ModerationStatus) ? (rawStatus as ModerationStatus | "flagged") : "pending";
  const [stats, queue, log] = await Promise.all([ctx.profiles.adminStats(), ctx.reports.listForModeration(status, 100), ctx.reports.moderationLog(20)]);

  const tiles = [
    { label: "Users", value: stats.total_users },
    { label: "Scans (all time)", value: stats.total_scans },
    { label: "Scans (7 days)", value: stats.scans_last_7_days },
    { label: "Pending reports", value: stats.reports_by_status.pending ?? 0 },
    { label: "Flagged reports", value: stats.flagged_reports },
  ];

  return (
    <>
      <PageHeader title="Admin dashboard" description="Aggregate statistics and community report moderation. Scan contents are never shown here." />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.label}><CardBody><p className="text-sm text-muted">{t.label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{t.value}</p></CardBody></Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Scans by risk level" />
          <CardBody>
            <ul className="space-y-1.5 text-sm">
              {RISK_LEVELS.map((l) => (
                <li key={l} className="flex justify-between"><span className={LEVEL_META[l].text}>{LEVEL_META[l].label}</span><span className="font-semibold tabular-nums">{stats.scans_by_level[l] ?? 0}</span></li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Scans by analysis mode" />
          <CardBody>
            <ul className="space-y-1.5 text-sm">
              {([["ai", "Claude AI + rules"], ["rules_only", "Rule-based only"], ["mock", "Mock (test)"]] as const).map(([k, label]) => (
                <li key={k} className="flex justify-between"><span>{label}</span><span className="font-semibold tabular-nums">{stats.scans_by_mode[k] ?? 0}</span></li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Moderation queue" description="Approve only reports that follow the guidelines. Approval means 'fit to publish', not 'verified true'." />
        <nav aria-label="Queue filter" className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
          {FILTERS.map((f) => (
            <Link key={f} href={`/admin?status=${f}`} aria-current={f === status ? "page" : undefined} className={cn("rounded-full px-3 py-1 text-sm font-medium capitalize", f === status ? "bg-brand-600 text-white" : "bg-canvas text-ink-soft hover:bg-brand-50")}>
              {f}
            </Link>
          ))}
        </nav>
        {queue.length === 0 ? (
          <EmptyState icon={<UsersIcon />} title={`No ${status} reports`} />
        ) : (
          <ul className="divide-y divide-line">
            {queue.map((r) => (
              <li key={r.id} className="space-y-3 px-5 py-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{r.company_name}{r.opportunity_title ? <span className="font-normal text-ink-soft"> — {r.opportunity_title}</span> : null}</p>
                  <p className="text-xs text-muted">{formatDateTime(r.created_at)} · status: {r.moderation_status} · flags: {r.flag_count}</p>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ink-soft">{r.description}</p>
                {r.evidence_excerpt ? <blockquote className="border-l-4 border-line pl-3 text-sm italic">“{r.evidence_excerpt}”</blockquote> : null}
                <p className="text-xs text-muted">
                  {r.opportunity_url ? <>Link domain: <span className="font-mono">{domainOf(r.opportunity_url)}</span> · </> : null}
                  {r.contact_channel ? <>Contact channel: {r.contact_channel}</> : null}
                </p>
                <ModerationControls id={r.id} status={r.moderation_status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Recent moderation actions" />
        {log.length === 0 ? (
          <CardBody><p className="text-sm text-ink-soft">No actions yet.</p></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="px-5 py-2">When</th><th className="px-5 py-2">Action</th><th className="px-5 py-2">Change</th><th className="px-5 py-2">Reason</th></tr></thead>
              <tbody className="divide-y divide-line">
                {log.map((a) => (
                  <tr key={a.id}><td className="whitespace-nowrap px-5 py-2">{formatDateTime(a.created_at)}</td><td className="px-5 py-2 font-medium">{a.action}{a.admin_id ? "" : " (automatic)"}</td><td className="whitespace-nowrap px-5 py-2">{a.previous_status} → {a.new_status}</td><td className="px-5 py-2 text-ink-soft">{a.reason}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
