/**
 * Data minimisation: remove sensitive personal/financial identifiers BEFORE
 * text is stored or sent to Claude. Placeholders keep enough meaning for the
 * rule engine (e.g. an ad that contains a bank account number is itself a
 * payment warning sign) without retaining the value.
 */

export type RedactionType =
  | "card_number"
  | "bank_account"
  | "iban"
  | "ifsc"
  | "upi_id"
  | "government_id"
  | "password"
  | "otp"
  | "phone";

export const REDACTION_PLACEHOLDERS: Record<RedactionType, string> = {
  card_number: "[REDACTED: card number]",
  bank_account: "[REDACTED: bank account number]",
  iban: "[REDACTED: IBAN]",
  ifsc: "[REDACTED: bank IFSC code]",
  upi_id: "[REDACTED: UPI ID]",
  government_id: "[REDACTED: ID number]",
  password: "[REDACTED: password]",
  otp: "[REDACTED: one-time code]",
  phone: "[REDACTED: phone number]",
};

export interface RedactionResult {
  text: string;
  redactions: { type: RedactionType; count: number }[];
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

interface Pass {
  type: RedactionType;
  re: RegExp;
  /** Return replacement or null to keep the original match. */
  replace?: (match: string, ...groups: string[]) => string | null;
}

const PASSES: Pass[] = [
  {
    type: "password",
    re: /\b(password|passcode|passwd|pwd|mpin|upi pin|atm pin)\b(\s*(?:is|:|=|-)\s*)(\S{3,})/gi,
    replace: (_m, label, sep) => `${label}${sep}${REDACTION_PLACEHOLDERS.password}`,
  },
  {
    type: "otp",
    re: /\b(otp|one[- ]time (?:password|code)|verification code)\b(\s*(?:is|:|=|-)?\s*)(\d{4,8})\b/gi,
    replace: (_m, label, sep) => `${label}${sep}${REDACTION_PLACEHOLDERS.otp}`,
  },
  {
    type: "card_number",
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    replace: (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits) ? REDACTION_PLACEHOLDERS.card_number : null;
    },
  },
  { type: "iban", re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g },
  { type: "ifsc", re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  {
    type: "bank_account",
    re: /\b((?:a\/c|acct|account)\s*(?:no\.?|number|num|#)?\s*[:\-]?\s*)(\d[\d -]{7,20}\d)\b/gi,
    replace: (_m, label) => `${label}${REDACTION_PLACEHOLDERS.bank_account}`,
  },
  {
    type: "upi_id",
    re: /\b[\w.-]{2,}@(?:okaxis|oksbi|okhdfcbank|okicici|ybl|paytm|upi|ibl|axl|apl|ptyes|ptsbi|ptaxis|pthdfc|icici|sbi|hdfcbank|axisbank|kotak)\b(?!\.)/gi,
  },
  // US SSN, Indian PAN, Aadhaar (12 digits in 4-4-4)
  { type: "government_id", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "government_id", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { type: "government_id", re: /\b\d{4}[ -]\d{4}[ -]\d{4}\b/g },
  // Phone numbers: international (+), Indian mobile, North-American formats.
  { type: "phone", re: /\+\d{1,3}[\s-]?\(?\d{1,5}\)?(?:[\s-]?\d){5,11}\b/g },
  { type: "phone", re: /\b[6-9]\d{9}\b/g },
  { type: "phone", re: /(?:\(\d{3}\)\s?|\b\d{3}[-.])\d{3}[-.]\d{4}\b/g },
];

export function redactSensitive(input: string): RedactionResult {
  let text = input;
  const counts = new Map<RedactionType, number>();

  for (const pass of PASSES) {
    text = text.replace(pass.re, (match: string, ...rest: unknown[]) => {
      const groups = rest.filter((g): g is string => typeof g === "string");
      const replacement = pass.replace ? pass.replace(match, ...groups) : REDACTION_PLACEHOLDERS[pass.type];
      if (replacement === null) return match;
      counts.set(pass.type, (counts.get(pass.type) ?? 0) + 1);
      return replacement;
    });
  }

  return {
    text,
    redactions: [...counts.entries()].map(([type, count]) => ({ type, count })),
  };
}

/** Client-side helper: does the text look like it contains the user's own sensitive data? */
export function containsSensitiveData(input: string): boolean {
  return redactSensitive(input).redactions.some((r) => r.type !== "phone");
}
