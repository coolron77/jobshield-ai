import { CATEGORY_LABELS, type Report } from "@/lib/analysis/schema";

/** Plain-text version of a report for "Copy report". */
export function reportToText(report: Report, meta: { title?: string; url?: string | null; createdAt?: string } = {}): string {
  const lines: string[] = [];
  lines.push(`JobShield AI report${meta.title ? ` — ${meta.title}` : ""}`);
  if (meta.createdAt) lines.push(`Generated: ${new Date(meta.createdAt).toLocaleString("en-IN")}`);
  if (meta.url) lines.push(`URL: ${meta.url}`);
  lines.push(`Warning-sign score: ${report.risk_score}/100 (${report.risk_level.toUpperCase()})`);
  lines.push(`Analysis mode: ${report.mode === "ai" ? `Claude AI + rules (${report.model ?? "Claude"})` : report.mode === "mock" ? "Mock AI (test mode)" : "Rule-based only"}`);
  lines.push("", "Summary", report.summary, "", "Recommendation", report.recommendation);
  if (report.ai_note) lines.push(`AI note: ${report.ai_note}`);
  const counted = report.findings.filter((f) => !f.missing_info);
  if (counted.length) {
    lines.push("", "Warning signs");
    counted.forEach((f, i) => {
      lines.push(`${i + 1}. [${f.severity.toUpperCase()}] ${f.title} (${CATEGORY_LABELS[f.category]}, confidence ${Math.round(f.confidence * 100)}%)`);
      if (f.evidence_quote) lines.push(`   Evidence: "${f.evidence_quote.replace(/\s+/g, " ")}"`);
      lines.push(`   Why: ${f.explanation}`);
      if (f.recommended_action) lines.push(`   Do: ${f.recommended_action}`);
    });
  }
  if (report.positive_signals.length) {
    lines.push("", "Positive signals");
    for (const p of report.positive_signals) lines.push(`- ${p.signal} ("${p.evidence_quote.replace(/\s+/g, " ")}")`);
  }
  if (report.missing_information.length) {
    lines.push("", "Missing information");
    for (const m of report.missing_information) lines.push(`- ${m}`);
  }
  if (report.verification_steps.length) {
    lines.push("", "How to verify");
    for (const s of report.verification_steps) lines.push(`- ${s}`);
  }
  lines.push("", "Limitations");
  for (const l of report.limitations) lines.push(`- ${l}`);
  lines.push("", "JobShield AI is an advisory screening tool. Its findings are not legal determinations or proof of fraud. Always verify opportunities independently.");
  return lines.join("\n");
}
