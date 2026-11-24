import type { Metadata } from "next";
import Link from "next/link";
import { RISK_LEVELS } from "@/lib/analysis/schema";
import { requirePageContext } from "@/server/session";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ArrowRightIcon, CompareIcon, FlagIcon, HistoryIcon, SearchIcon, ShieldIcon } from "@/components/ui/icons";
import { LEVEL_META, RiskBadge } from "@/components/ui/risk";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const TIPS = [
  "Never pay to get a job — not for registration, training, kits or 'refundable' deposits.",
  "Find the company's website yourself and apply through its official careers page.",
  "Real interviews involve real people. Be wary of chat-only interviews on WhatsApp or Telegram.",
  "Don't share OTPs, PINs or passwords with anyone — no employer needs them.",
  "Share ID and bank documents only after a verified written offer, through official HR channels.",
  "If pay sounds too good for the effort, compare it with typical salaries for the role.",
];

export default async function DashboardPage() {
  const { ctx, session } = await requirePageContext("/dashboard");
  const [stats, comparisons, myReports, profile] = await Promise.all([
    ctx.scans.stats(session.user.id),
    ctx.comparisons.list(session.user.id),
    ctx.reports.listMine(session.user.id),
    ctx.profiles.get(session.user.id),
  ]);
  const max = Math.max(1, ...RISK_LEVELS.map((l) => stats.byLevel[l]));
  const tip = TIPS[new Date().getDate() % TIPS.length];

  return (
    <>
      <PageHeader title={`Hi${profile?.display_name ? `, ${profile.display_name}` : ""}`} description="Your scans, saved comparisons and community reports at a glance." actions={<ButtonLink href="/scan"><SearchIcon className="h-4 w-4" /> Scan a job ad</ButtonLink>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardBody><p className="text-sm text-muted">Total scans</p><p className="mt-1 text-3xl font-bold tabular-nums" data-testid="total-scans">{stats.total}</p></CardBody></Card>
        <Card><CardBody><p className="text-sm text-muted">High or critical</p><p className="mt-1 text-3xl font-bold tabular-nums text-risk-critical">{stats.byLevel.high + stats.byLevel.critical}</p></CardBody></Card>
        <Card><CardBody><p className="text-sm text-muted">Saved comparisons</p><p className="mt-1 text-3xl font-bold tabular-nums">{comparisons.length}</p></CardBody></Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="Risk breakdown" description="Scans by warning-sign level" />
          <CardBody>
            {stats.total === 0 ? (
              <p className="text-sm text-ink-soft">No scans yet.</p>
            ) : (
              <ul className="space-y-3" aria-label="Scans per risk level">
                {RISK_LEVELS.map((l) => {
                  const m = LEVEL_META[l];
                  const n = stats.byLevel[l];
                  return (
                    <li key={l}>
                      <div className="flex justify-between text-sm">
                        <span className={`flex items-center gap-1.5 font-medium ${m.text}`}><m.Icon className="h-4 w-4" />{m.label} <span className="font-normal text-muted">({m.range})</span></span>
                        <span className="font-semibold tabular-nums">{n}</span>
                      </div>
                      <div className="mt-1 h-2.5 rounded-full bg-canvas" aria-hidden="true">
                        <div className="h-2.5 rounded-full" style={{ width: `${(n / max) * 100}%`, background: m.stroke }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent scans" action={<Link href="/scans" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} />
          {stats.recent.length === 0 ? (
            <EmptyState icon={<HistoryIcon />} title="No scans yet" description="Paste a job ad to get your first report." action={<ButtonLink href="/scan">Scan a job ad</ButtonLink>} />
          ) : (
            <ul className="divide-y divide-line">
              {stats.recent.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/scans/${s.id}`} className="block truncate font-medium hover:text-brand-700 hover:underline">{s.title}</Link>
                    <p className="text-xs text-muted">{formatDateTime(s.created_at)}</p>
                  </div>
                  <RiskBadge level={s.risk_level} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Saved comparisons" action={<Link href="/compare" className="text-sm font-medium text-brand-700 hover:underline">Compare</Link>} />
          <CardBody>
            {comparisons.length === 0 ? (
              <p className="text-sm text-ink-soft">Compare two scans side by side and save the result.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {comparisons.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <Link href={`/compare?a=${c.scan_a_id}&b=${c.scan_b_id}`} className="flex items-center gap-2 hover:underline">
                      <CompareIcon className="h-4 w-4 shrink-0 text-muted" />
                      <span className="truncate">{c.scan_a_title ?? "Scan"} vs {c.scan_b_title ?? "Scan"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Your community reports" action={<Link href="/community/new" className="text-sm font-medium text-brand-700 hover:underline">New report</Link>} />
          <CardBody>
            {myReports.length === 0 ? (
              <p className="text-sm text-ink-soft">Share an experience to help other job seekers. Reports are reviewed before publication.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {myReports.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2"><FlagIcon className="h-4 w-4 shrink-0 text-muted" /><span className="truncate">{r.company_name}</span></span>
                    <span className="shrink-0 text-xs text-muted">{r.moderation_status} · {formatDate(r.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card className="bg-brand-50">
          <CardHeader title="Safety tip" />
          <CardBody>
            <p className="flex gap-3 text-sm text-ink"><ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />{tip}</p>
            <Link href="/tools/payment" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
              Check an ad for payment requests <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
