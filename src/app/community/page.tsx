import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createReportRepository } from "@/lib/db/supabase-repos";
import { getSession } from "@/server/session";
import { Alert, ButtonLink, Card, CardBody, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui/primitives";
import { FlagIcon, SearchIcon, UsersIcon } from "@/components/ui/icons";
import { FlagReportButton } from "@/components/community/flag-report-button";
import { WithdrawReportButton } from "@/components/community/withdraw-report-button";
import { REPORTING_GUIDELINES } from "@/components/community/guidelines";
import { domainOf, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Community reports" };

const STATUS_LABEL = { pending: "Awaiting review", approved: "Published", rejected: "Not published", removed: "Removed" } as const;

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q: rawQ, page: rawPage } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ.trim().slice(0, 100) : "";
  const page = Math.max(1, Math.min(500, Number.parseInt(rawPage ?? "1", 10) || 1));
  const session = await getSession();
  if (!session.configured || !session.client) redirect("/setup");

  const repo = createReportRepository(session.client);
  const [{ items, total }, mine] = await Promise.all([
    repo.listPublic({ q: q || undefined, limit: 20, offset: (page - 1) * 20 }),
    session.user ? repo.listMine(session.user.id) : Promise.resolve([]),
  ]);

  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Community reports"
        description="Experiences shared by job seekers and reviewed by moderators against our guidelines."
        actions={<ButtonLink href="/community/new"><FlagIcon className="h-4 w-4" /> Submit a report</ButtonLink>}
      />
      <Alert tone="warning" title="These are personal accounts, not verified findings" className="mb-6">
        Moderators check reports for personal data, abuse and relevance — not whether every claim is true. A report here does not prove that a company or person committed fraud. Always verify independently.
      </Alert>

      {mine.length ? (
        <Card className="mb-6">
          <CardHeader title="Your reports" description="Only you (and moderators) can see these until they're published." />
          <ul className="divide-y divide-line">
            {mine.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{r.company_name}</span>
                <span className="text-muted">{formatDate(r.created_at)}</span>
                <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{STATUS_LABEL[r.moderation_status]}</span>
                <WithdrawReportButton id={r.id} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <form role="search" action="/community" className="mb-4 flex gap-2">
        <label htmlFor="q" className="sr-only">Search reports</label>
        <Input id="q" name="q" defaultValue={q} placeholder="Search by company or job title" className="mt-0" maxLength={100} />
        <button type="submit" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
          <SearchIcon className="h-4 w-4" /> Search
        </button>
      </form>

      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<UsersIcon />} title={q ? "No published reports match your search" : "No published reports yet"} description="Reports appear here after a moderator reviews them." />
        </Card>
      ) : (
        <ul className="space-y-4">
          {items.map((r) => (
            <li key={r.id}>
              <Card>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-ink">Reported experience: {r.company_name}</h2>
                      <p className="text-sm text-muted">
                        {r.opportunity_title ? `${r.opportunity_title} · ` : ""}Submitted {formatDate(r.created_at)}
                        {r.moderated_at ? ` · Reviewed ${formatDate(r.moderated_at)}` : ""}
                      </p>
                    </div>
                    {session.user ? <FlagReportButton id={r.id} /> : null}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-ink-soft">{r.description}</p>
                  {r.evidence_excerpt ? (
                    <blockquote className="mt-3 border-l-4 border-line pl-3 text-sm italic text-ink">
                      Excerpt shared by the reporter: “{r.evidence_excerpt}”
                    </blockquote>
                  ) : null}
                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                    {r.opportunity_url ? <div><dt className="inline">Link domain: </dt><dd className="inline font-mono">{domainOf(r.opportunity_url) ?? "—"}</dd></div> : null}
                    {r.contact_channel ? <div><dt className="inline">Contact channel: </dt><dd className="inline">{r.contact_channel}</dd></div> : null}
                  </dl>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {total > page * 20 ? (
        <div className="mt-4 text-center">
          <ButtonLink variant="outline" href={`/community?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`}>Load more</ButtonLink>
        </div>
      ) : null}

      <Card className="mt-8">
        <CardHeader title="Reporting guidelines" />
        <CardBody>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
            {REPORTING_GUIDELINES.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </CardBody>
      </Card>
    </main>
  );
}
