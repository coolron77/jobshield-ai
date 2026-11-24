import type { AnalysisMode, RiskLevel, Severity } from "@/lib/analysis/schema";
import { cn } from "@/lib/utils";
import { AlertIcon, CheckIcon, InfoIcon, ShieldIcon } from "./icons";

export const LEVEL_META: Record<RiskLevel, { label: string; text: string; bg: string; ring: string; stroke: string; Icon: typeof AlertIcon; range: string }> = {
  low: { label: "Low", text: "text-risk-low", bg: "bg-risk-low-bg", ring: "border-[#b9e4cb]", stroke: "#146c43", Icon: CheckIcon, range: "0–24" },
  medium: { label: "Medium", text: "text-risk-medium", bg: "bg-risk-medium-bg", ring: "border-[#f5d9a0]", stroke: "#b57200", Icon: InfoIcon, range: "25–49" },
  high: { label: "High", text: "text-risk-high", bg: "bg-risk-high-bg", ring: "border-[#f8c9ab]", stroke: "#c84400", Icon: AlertIcon, range: "50–74" },
  critical: { label: "Critical", text: "text-risk-critical", bg: "bg-risk-critical-bg", ring: "border-[#f3c3c8]", stroke: "#b4232c", Icon: AlertIcon, range: "75–100" },
};

/** Level badge: always icon + text, never colour alone. */
export function RiskBadge({ level, className, suffix = "risk" }: { level: RiskLevel; className?: string; suffix?: string }) {
  const m = LEVEL_META[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", m.bg, m.text, m.ring, className)}>
      <m.Icon className="h-3.5 w-3.5" />
      {m.label} {suffix}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const m = LEVEL_META[severity];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", m.bg, m.text)}>
      <m.Icon className="h-3.5 w-3.5" />
      {m.label} severity
    </span>
  );
}

export function ModeBadge({ mode, model }: { mode: AnalysisMode; model?: string | null }) {
  const styles: Record<AnalysisMode, { label: string; cls: string; title: string }> = {
    ai: { label: "Claude AI + rules", cls: "border-brand-200 bg-brand-50 text-brand-800", title: `Analysed with ${model ?? "Claude"} plus deterministic rules` },
    rules_only: { label: "Rule-based only", cls: "border-line bg-canvas text-ink-soft", title: "AI analysis was unavailable; deterministic rules only" },
    mock: { label: "Mock AI (test mode)", cls: "border-[#f5d9a0] bg-risk-medium-bg text-risk-medium", title: "Deterministic test fixture — not a real AI analysis" },
  };
  const s = styles[mode];
  return (
    <span title={s.title} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", s.cls)}>
      <ShieldIcon className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}

/** Circular score meter with the number and level as text. */
export function RiskGauge({ score, level, size = 132 }: { score: number; level: RiskLevel; size?: number }) {
  const m = LEVEL_META[level];
  const r = 52;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="relative inline-flex shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Warning-sign score ${score} out of 100, ${m.label} risk`}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e3e8f2" strokeWidth="10" />
        {filled > 0 ? (
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={m.stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${c - filled}`}
            transform="rotate(-90 60 60)"
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums text-ink">{score}</span>
        <span className={cn("text-xs font-semibold uppercase tracking-wide", m.text)}>{m.label}</span>
      </div>
    </div>
  );
}
