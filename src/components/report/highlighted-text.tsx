import { computeHighlights } from "@/lib/analysis/evidence";
import { LEVEL_META } from "@/components/ui/risk";
import type { ReportFinding, Severity } from "@/lib/analysis/schema";

/**
 * Renders the analysed advertisement as plain text (React escapes it — no
 * HTML from the submission is ever interpreted) with exact evidence quotes
 * highlighted. Each highlight links to its finding.
 */
export function HighlightedText({ text, findings }: { text: string; findings: ReportFinding[] }) {
  const ranges = computeHighlights(
    text,
    findings.filter((f) => f.evidence_quote).map((f) => ({ id: f.id, quote: f.evidence_quote, severity: f.severity })),
  );
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) parts.push(text.slice(cursor, r.start));
    const sev = r.severity as Severity;
    parts.push(
      <mark key={i} className={`mark-${sev} rounded px-0.5 text-ink`} title={`${LEVEL_META[sev].label} severity warning sign`}>
        <a href={`#finding-${r.ids[0]}`} className="text-inherit no-underline">
          {text.slice(r.start, r.end)}
        </a>
        <span className="sr-only"> ({LEVEL_META[sev].label} severity warning sign)</span>
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-canvas p-4 text-[14.5px] leading-relaxed text-ink-soft print:max-h-none">
      {parts}
    </div>
  );
}
