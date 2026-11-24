import type { Category, ReportFinding, RiskLevel, Severity } from "./schema";
import { CATEGORY_LABELS } from "./schema";

/**
 * Transparent risk scoring.
 *
 *  1. Deduplicate: findings describing the same behaviour are merged — rule
 *     hits that share a signal key (e.g. two different fee mentions), and
 *     Claude findings whose quote overlaps an existing finding in the same
 *     category (e.g. a rule hit and a Claude finding quoting the same sentence).
 *  2. Points per finding = SEVERITY_POINTS[severity] × confidence.
 *  3. Diminishing returns within a category: the strongest finding counts
 *     100 %, the next 50 %, then 25 %, ... so repetitive wording cannot stack.
 *  4. Missing-information findings are capped at MISSING_INFO_CAP points in
 *     total — missing details alone never make a posting "high risk".
 *  5. Floors: a confident critical finding puts the score at >= 60, a confident
 *     high finding at >= 30, because one such sign is serious on its own.
 *  6. Clamp to 0–100. Bands: 0–24 low, 25–49 medium, 50–74 high, 75–100 critical.
 *
 * The score measures detected warning signs. It is NOT a calibrated
 * probability that a posting is fraudulent.
 */

export const SEVERITY_POINTS: Record<Severity, number> = { low: 5, medium: 12, high: 25, critical: 40 };
export const CATEGORY_DECAY = 0.5;
export const MISSING_INFO_CAP = 10;
export const MIN_COUNTED_CONFIDENCE = 0.3;
export const FLOORS: { severity: Severity; minConfidence: number; floor: number }[] = [
  { severity: "critical", minConfidence: 0.7, floor: 60 },
  { severity: "high", minConfidence: 0.7, floor: 30 },
];

export const SEVERITY_ORDER: Severity[] = ["low", "medium", "high", "critical"];

export function levelForScore(score: number): RiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export interface CandidateFinding {
  id: string;
  source: "rule" | "ai";
  rule_id: string | null;
  signal: string | null;
  category: Category;
  severity: Severity;
  title: string;
  evidence_quote: string;
  explanation: string;
  confidence: number;
  recommended_action: string;
  start: number;
  end: number;
  missing_info: boolean;
}

function weight(f: { severity: Severity; confidence: number }): number {
  return SEVERITY_POINTS[f.severity] * f.confidence;
}

function overlapLength(a: { start: number; end: number }, b: { start: number; end: number }): number {
  if (a.start < 0 || b.start < 0) return 0;
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/**
 * Merge findings that describe the same behaviour:
 *  - rule findings merge only when they share a signal key (rules were
 *    designed so distinct behaviours have distinct keys);
 *  - each AI finding joins the existing cluster in the same category whose
 *    evidence overlaps it most, otherwise it starts a new cluster.
 */
export function deduplicate(candidates: CandidateFinding[]): Array<CandidateFinding & { sources: Set<"rule" | "ai">; merged: number }> {
  const clusters: CandidateFinding[][] = [];
  const bySignal = new Map<string, CandidateFinding[]>();

  for (const c of candidates.filter((x) => x.source === "rule")) {
    const key = c.signal ?? `rule:${c.id}`;
    const existing = bySignal.get(key);
    if (existing) existing.push(c);
    else {
      const cluster = [c];
      bySignal.set(key, cluster);
      clusters.push(cluster);
    }
  }

  for (const c of candidates.filter((x) => x.source === "ai")) {
    let best: CandidateFinding[] | null = null;
    let bestOverlap = 0;
    for (const cluster of clusters) {
      if (cluster[0]?.category !== c.category) continue;
      const ov = Math.max(...cluster.map((m) => overlapLength(m, c)));
      if (ov > bestOverlap) {
        bestOverlap = ov;
        best = cluster;
      }
    }
    if (best) best.push(c);
    else clusters.push([c]);
  }

  return clusters.map((members) => {
    const sorted = [...members].sort((a, b) => weight(b) - weight(a));
    const top = sorted[0] as CandidateFinding;
    const ai = sorted.find((m) => m.source === "ai");
    const rule = sorted.find((m) => m.source === "rule");
    const sources = new Set(members.map((m) => m.source));
    return {
      ...top,
      title: rule?.title ?? top.title,
      rule_id: rule?.rule_id ?? null,
      signal: rule?.signal ?? top.signal,
      // Claude's explanation is specific to this ad; prefer it when available.
      explanation: ai?.explanation ?? top.explanation,
      recommended_action: ai?.recommended_action || top.recommended_action,
      confidence: Math.max(...members.map((m) => m.confidence)),
      missing_info: members.every((m) => m.missing_info),
      sources,
      merged: members.length,
    };
  });
}

export interface ScoreResult {
  score: number;
  level: RiskLevel;
  raw_total: number;
  floor_applied: string | null;
  contributions: { finding_id: string; label: string; category: Category; severity: Severity; confidence: number; points: number }[];
  findings: ReportFinding[];
}

export function scoreFindings(candidates: CandidateFinding[]): ScoreResult {
  const merged = deduplicate(candidates);

  // Points with per-category diminishing returns
  const byCategory = new Map<Category, typeof merged>();
  for (const f of merged.filter((m) => !m.missing_info)) {
    const list = byCategory.get(f.category) ?? [];
    list.push(f);
    byCategory.set(f.category, list);
  }

  const points = new Map<string, number>();
  for (const list of byCategory.values()) {
    list.sort((a, b) => weight(b) - weight(a));
    list.forEach((f, i) => {
      const p = f.confidence < MIN_COUNTED_CONFIDENCE ? 0 : weight(f) * Math.pow(CATEGORY_DECAY, i);
      points.set(f.id, p);
    });
  }

  // Missing information: capped total, distributed proportionally
  const missing = merged.filter((m) => m.missing_info);
  const missingRaw = missing.reduce((s, f) => s + weight(f), 0);
  const missingScale = missingRaw > MISSING_INFO_CAP ? MISSING_INFO_CAP / missingRaw : 1;
  for (const f of missing) points.set(f.id, weight(f) * missingScale);

  const raw_total = [...points.values()].reduce((a, b) => a + b, 0);

  let floor = 0;
  let floor_applied: string | null = null;
  for (const rule of FLOORS) {
    const hit = merged.find((f) => !f.missing_info && f.severity === rule.severity && f.confidence >= rule.minConfidence);
    if (hit && rule.floor > floor) {
      floor = rule.floor;
      floor_applied = `A ${rule.severity}-severity warning sign ("${hit.title}") sets a minimum score of ${rule.floor}.`;
      break; // FLOORS ordered from highest
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(Math.max(raw_total, floor))));
  if (raw_total >= floor) floor_applied = null;

  const findings: ReportFinding[] = merged
    .map((f) => {
      const p = Math.round((points.get(f.id) ?? 0) * 10) / 10;
      const source: ReportFinding["source"] = f.sources.size > 1 ? "rule+ai" : f.source;
      return {
        id: f.id,
        source,
        rule_id: f.rule_id,
        category: f.category,
        severity: f.severity,
        title: f.title || CATEGORY_LABELS[f.category],
        evidence_quote: f.evidence_quote,
        explanation: f.explanation,
        confidence: Math.round(f.confidence * 100) / 100,
        recommended_action: f.recommended_action,
        points: p,
        counted: p > 0,
        missing_info: f.missing_info,
      };
    })
    .sort((a, b) => b.points - a.points || SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity));

  const contributions = findings
    .filter((f) => f.counted)
    .map((f) => ({ finding_id: f.id, label: f.title, category: f.category, severity: f.severity, confidence: f.confidence, points: f.points }));

  return { score, level: levelForScore(score), raw_total: Math.round(raw_total * 10) / 10, floor_applied, contributions, findings };
}
