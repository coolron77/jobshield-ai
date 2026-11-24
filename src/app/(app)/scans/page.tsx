import type { Metadata } from "next";
import Link from "next/link";
import { RISK_LEVELS } from "@/lib/analysis/schema";
import { ScanListQuerySchema } from "@/lib/validation";
import { PAGE_SIZE } from "@/server/handlers/scans";
import { requirePageContext } from "@/server/session";
import { ButtonLink, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { HistoryIcon, SearchIcon } from "@/components/ui/icons";
import { LEVEL_META, ModeBadge, RiskBadge } from "@/components/ui/risk";
import { DeleteScanButton } from "@/components/scan/delete-scan-button";
import { domainOf, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Scan history" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const parsed = ScanListQuerySchema.safeParse({ q: typeof raw.q === "string" ? raw.q : undefined, level: typeof raw.level === "string" && raw.level ? raw.level : undefined, page: raw.page ?? "1" });
  const { q, level, page } = parsed.success ? parsed.data : { q: undefined, level: undefined, page: 1 };
  const { ctx, session } = await requirePageContext("/scans");
  const { items, total } = await ctx.scans.list({ ownerId: session.user.id, q, level, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (level) s.set("level", level);
    if (p > 1) s.set("page", String(p));
    const str = s.toString();
    return str ? `/scans?${str}` : "/scans";
  };

  return (
    <>
      <PageHeader title="Scan history" description="Your private scans. Only you can see them." actions={<ButtonLink href="/scan">New scan</ButtonLink>} />
      <Card>
        <form role="search" className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-end" action="/scans">
          <div className="flex-1">
            <label htmlFor="q" className="text-sm font-semibold">Search</label>
            <Input id="q" name="q" defaultValue={q ?? ""} placeholder="Title, company or link" maxLength={100} />
          </div>
          <div className="sm:w-48">
            <label htmlFor="level" className="text-sm font-semibold">Risk level</label>
            <Select id="level" name="level" defaultValue={level ?? ""}>
              <option value="">All levels</option>
              {RISK_LEVELS.map((l) => (
                <option key={l} value={l}>{LEVEL_META[l].label}</option>
              ))}
            </Select>
          </div>
          <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
            <SearchIcon className="h-4 w-4" /> Apply
          </button>
        </form>

        {items.length === 0 ? (
          <EmptyState
            icon={<HistoryIcon />}
            title={q || level ? "No scans match these filters" : "No scans yet"}
            description={q || level ? "Try a different search or clear the filters." : "Scan your first job ad to start building your history."}
            action={q || level ? <ButtonLink href="/scans" variant="outline">Clear filters</ButtonLink> : <ButtonLink href="/scan">Scan a job ad</ButtonLink>}
          />
        ) : (
          <ul className="divide-y divide-line" data-testid="scan-list">
            {items.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <Link href={`/scans/${s.id}`} className="font-semibold text-ink hover:text-brand-700 hover:underline">{s.title}</Link>
                  <p className="mt-0.5 text-sm text-muted">
                    {formatDateTime(s.created_at)}
                    {s.company_name ? ` · ${s.company_name}` : ""}
                    {s.submitted_url ? ` · ${domainOf(s.submitted_url)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold tabular-nums">{s.risk_score}</span>
                  <RiskBadge level={s.risk_level} />
                  {s.analysis_mode !== "ai" ? <ModeBadge mode={s.analysis_mode} /> : null}
                  <DeleteScanButton id={s.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link className="font-medium text-brand-700 hover:underline" href={qs(page - 1)}>← Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {pages} · {total} scans</span>
          {page < pages ? <Link className="font-medium text-brand-700 hover:underline" href={qs(page + 1)}>Next →</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
