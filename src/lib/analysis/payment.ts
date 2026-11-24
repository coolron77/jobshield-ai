import { redactSensitive } from "./redact";
import { runRules, type RuleFinding } from "./rules";

/**
 * Payment-request detector: classifies requests for money in an ad and
 * explains why each type deserves caution — without claiming that every fee
 * proves fraud.
 */

export const FEE_TYPES = {
  registration: {
    label: "Registration / application fee",
    why: "Employers recover hiring costs from their own budget. A fee just to apply or register is rarely legitimate.",
  },
  security_deposit: {
    label: "Security or refundable deposit",
    why: "'Refundable' deposits are a common way to make a payment feel safe; refunds frequently never arrive.",
  },
  training: {
    label: "Training or certification fee",
    why: "Paid training as a condition of being hired shifts the employer's cost to you. Genuine paid courses are sold separately, not as a hiring step.",
  },
  interview: {
    label: "Interview or test fee",
    why: "Legitimate interviews and assessments are free for candidates.",
  },
  equipment: {
    label: "Equipment, kit or software purchase",
    why: "Being told to buy equipment from a vendor the employer names is a known reimbursement scam.",
  },
  processing: {
    label: "Processing, verification or documentation fee",
    why: "Background checks and document processing are normally paid by the employer.",
  },
  task_deposit: {
    label: "Deposit to unlock tasks or withdraw earnings",
    why: "This is the core mechanism of task scams: deposits are kept and promised earnings are never paid out.",
  },
  untraceable: {
    label: "Gift cards, crypto or wire transfer",
    why: "These payment methods are hard to reverse, which is why scammers prefer them.",
  },
  other: {
    label: "Other payment request",
    why: "Any payment requested before you are employed deserves independent verification.",
  },
} as const;

export type FeeType = keyof typeof FEE_TYPES;

export function classifyFee(quote: string, ruleId: string): FeeType {
  const q = quote.toLowerCase();
  if (ruleId === "payment.deposit_to_unlock") return "task_deposit";
  if (ruleId === "payment.untraceable_method") return "untraceable";
  if (ruleId === "payment.buy_equipment" || /\b(?:kit|laptop|equipment|uniform|software)\b/.test(q)) return "equipment";
  if (/\b(?:security|refundable|caution)\b/.test(q) && /\bdeposit\b/.test(q)) return "security_deposit";
  if (/\binterview|test\b/.test(q)) return "interview";
  if (/\btraining|certificat|course\b/.test(q)) return "training";
  if (/\bregistration|application|enrol|joining\b/.test(q)) return "registration";
  if (/\bprocessing|verification|document|id ?card\b/.test(q)) return "processing";
  if (/\bdeposit\b/.test(q)) return "security_deposit";
  return "other";
}

export interface PaymentFinding {
  fee_type: FeeType;
  label: string;
  why: string;
  severity: RuleFinding["severity"];
  evidence_quote: string;
  rule_id: string;
}

export interface PaymentCheckResult {
  analyzedText: string;
  findings: PaymentFinding[];
  verdict: "payment_requested" | "payment_mentioned" | "none_detected";
  message: string;
  caveats: string[];
}

export function detectPaymentRequests(input: string): PaymentCheckResult {
  const { text } = redactSensitive(input);
  const hits = runRules(text).filter((f) => f.category === "payment");
  const findings: PaymentFinding[] = hits.map((h) => {
    const fee_type = classifyFee(h.evidence_quote, h.rule_id);
    return { fee_type, label: FEE_TYPES[fee_type].label, why: FEE_TYPES[fee_type].why, severity: h.severity, evidence_quote: h.evidence_quote, rule_id: h.rule_id };
  });
  const requested = hits.some((h) => h.severity === "critical" || h.severity === "high");
  const verdict = requested ? "payment_requested" : findings.length ? "payment_mentioned" : "none_detected";
  const message =
    verdict === "payment_requested"
      ? "This text asks the candidate to pay money. That is one of the most common signs of a job scam — verify with the company directly before paying anything."
      : verdict === "payment_mentioned"
        ? "Payment-related wording was found. Read it carefully and confirm with the company whether you are expected to pay."
        : "No requests for upfront payment were detected in this text. Scammers sometimes ask for money later in the process, so stay alert.";
  return {
    analyzedText: text,
    findings,
    verdict,
    message,
    caveats: [
      "Not every fee is fraud: costs you arrange yourself (for example an official exam or a background check through a government portal) can be legitimate. What matters is who you pay and why.",
      "Detection is based on wording. A payment request made later by phone or chat will not appear here.",
    ],
  };
}
