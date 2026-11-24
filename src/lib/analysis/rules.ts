import type { Category, Severity } from "./schema";
import { sentenceAround } from "./evidence";

/**
 * Deterministic warning-sign detectors. These run on every scan (with or
 * without Claude) and are the basis of the "rules-only" mode.
 *
 * Each rule documents its severity and a fixed confidence. Confidence is lower
 * for wording that also appears in many legitimate ads (e.g. "urgent hiring").
 */

export interface RuleDefinition {
  id: string;
  /** Rules that describe the same behaviour share a signal key (deduplication). */
  signal: string;
  category: Category;
  severity: Severity;
  confidence: number;
  title: string;
  explanation: string;
  recommended_action: string;
  patterns: RegExp[];
  missingInfo?: boolean;
}

export interface RuleFinding {
  rule_id: string;
  signal: string;
  category: Category;
  severity: Severity;
  confidence: number;
  title: string;
  explanation: string;
  recommended_action: string;
  evidence_quote: string;
  start: number;
  end: number;
  missing_info: boolean;
}

const MONEY = String.raw`(?:rs\.?|inr|₹|\$|usd|us\$|£|gbp|€|eur|aed|sgd)\s?\d`;

export const RULES: RuleDefinition[] = [
  // ---------------------------------------------------------------- payment
  {
    id: "payment.named_fee",
    signal: "payment.upfront",
    category: "payment",
    severity: "critical",
    confidence: 0.9,
    title: "Asks the candidate to pay a fee",
    explanation:
      "Legitimate employers rarely charge candidates to apply, interview, train or join. Registration, security, training or 'refundable' deposits are one of the most common patterns in job scams.",
    recommended_action: "Do not pay. Ask for the request in writing on the company's official domain and verify it with the company directly.",
    patterns: [
      /\b(?:registration|joining|security|training|processing|interview|onboarding|verification|application|enrol(?:l)?ment|kit|uniform|laptop|equipment|id ?card|documentation|refundable|caution)\s+(?:fees?|charges?|deposit|amount|payment|money)\b/gi,
      /\b(?:fees?|charges?|deposit)\s+(?:of\s+)?(?:rs\.?|inr|₹|\$|usd|£|€)\s?\d[\d,]*/gi,
    ],
  },
  {
    id: "payment.pay_amount",
    signal: "payment.upfront",
    category: "payment",
    severity: "critical",
    confidence: 0.85,
    title: "Instructs the candidate to send money",
    explanation:
      "The advertisement tells applicants to pay or transfer a specific amount. Paying to secure a job is a strong warning sign regardless of how the fee is described.",
    recommended_action: "Do not transfer money. Genuine employers pay you — not the other way round.",
    patterns: [
      new RegExp(String.raw`\b(?:pay|deposit|transfer|send|remit)\s+(?:a\s+|an\s+|the\s+|only\s+|just\s+)?(?:(?:one[- ]time|small|nominal|minimal|refundable|token)\s+)?(?:amount\s+of\s+|fee\s+of\s+)?${MONEY}`, "gi"),
    ],
  },
  {
    id: "payment.deposit_to_unlock",
    signal: "payment.upfront",
    category: "payment",
    severity: "critical",
    confidence: 0.85,
    title: "Requires a deposit to unlock work or withdraw earnings",
    explanation:
      "Being asked to top up, recharge or deposit money to 'unlock' tasks, activate an account or withdraw earnings is the core mechanism of task scams: the deposits are kept and the earnings never paid.",
    recommended_action: "Do not deposit money. If you already have, stop and report it to your bank and the local cybercrime authority.",
    patterns: [/\b(?:top[- ]?up|recharge|deposit|pay)\b[^.\n]{0,50}\bto\s+(?:unlock|withdraw|activate|upgrade|release)\b/gi],
  },
  {
    id: "payment.untraceable_method",
    signal: "payment.method",
    category: "payment",
    severity: "high",
    confidence: 0.8,
    title: "Mentions hard-to-trace payment methods",
    explanation: "Gift cards, cryptocurrency and wire services are favoured by scammers because payments are difficult to reverse.",
    recommended_action: "Never pay an employer with gift cards, crypto or money-transfer services.",
    patterns: [/\b(?:gift\s*cards?|itunes\s+cards?|google\s+play\s+cards?|bitcoin|btc|usdt|crypto(?:currency)?|western\s+union|moneygram)\b/gi],
  },
  {
    id: "payment.buy_equipment",
    signal: "payment.equipment",
    category: "payment",
    severity: "high",
    confidence: 0.7,
    title: "Requires buying equipment or a starter kit",
    explanation:
      "Some scams require new hires to buy equipment, software or a 'starter kit' from a specific vendor, sometimes with a promise of reimbursement that never arrives.",
    recommended_action: "Ask the employer to supply equipment directly. Do not buy from a vendor they nominate.",
    patterns: [/\b(?:purchase|buy)\b[^.\n]{0,40}\b(?:equipment|starter\s*kit|kit|laptop|software|licen[cs]e|devices?)\b[^.\n]{0,40}\b(?:from|through|via)\b/gi],
  },
  {
    id: "payment.destination_details",
    signal: "payment.destination",
    category: "payment",
    severity: "high",
    confidence: 0.7,
    title: "Includes payment account details",
    explanation:
      "The advertisement contained a bank account, card, IBAN or UPI identifier (removed before analysis). Job ads have no reason to publish where applicants should send money.",
    recommended_action: "Treat any request to send money to these details as a red flag.",
    patterns: [/\[REDACTED: (?:bank account number|IBAN|bank IFSC code|UPI ID|card number)\]/g],
  },
  {
    id: "payment.refund_reassurance",
    signal: "payment.reassurance",
    category: "payment",
    severity: "medium",
    confidence: 0.6,
    title: "Reassures that a payment is refundable",
    explanation: "'Fully refundable' promises are frequently used to make an upfront payment feel safe.",
    recommended_action: "A promise of a refund does not make an upfront payment safe.",
    patterns: [/\b(?:100\s*%|fully|completely)\s+refundable\b/gi, /\brefund(?:ed)?\s+(?:after|with|in)\s+(?:your\s+)?(?:first\s+)?(?:salary|joining)\b/gi],
  },
  // ---------------------------------------------------------------- salary
  {
    id: "salary.guaranteed_income",
    signal: "salary.guaranteed",
    category: "salary",
    severity: "high",
    confidence: 0.8,
    title: "Promises guaranteed earnings",
    explanation: "Real employers describe pay; they do not 'guarantee' income or returns. Guaranteed-earnings language is typical of task, investment and pyramid schemes.",
    recommended_action: "Ask for a written offer stating base pay, and compare it with typical pay for the role.",
    patterns: [/\bguaranteed\s+(?:monthly\s+|weekly\s+|daily\s+)?(?:income|earnings?|salary|pay(?:out)?|returns?|profits?|commission)\b/gi, /\b(?:income|earnings?|salary|payouts?)\s+(?:is\s+)?guaranteed\b/gi],
  },
  {
    id: "salary.daily_weekly_earn",
    signal: "salary.easy_money",
    category: "salary",
    severity: "medium",
    confidence: 0.65,
    title: "Earnings pitched per day or week",
    explanation: "'Earn X per day' pitches are common in work-from-home and task scams. This is a reason to check the claim, not proof of fraud.",
    recommended_action: "Ask how pay is calculated, who pays it, and whether there is a written contract.",
    patterns: [
      new RegExp(String.raw`\bearn\s+(?:up\s+to\s+|upto\s+|over\s+|more\s+than\s+)?${MONEY}[\d,.]*\s*(?:k|lakh|lakhs)?\s*(?:\+\s*)?(?:per|\/|a|every|each)\s*(?:day|daily|week|hour)\b`, "gi"),
      /\b(?:daily|weekly)\s+(?:payouts?|payments?|income|earnings)\b/gi,
    ],
  },
  {
    id: "salary.low_effort",
    signal: "salary.easy_money",
    category: "salary",
    severity: "low",
    confidence: 0.5,
    title: "Very low time commitment for pay",
    explanation: "Promises of income for one or two hours of simple work are part of many 'easy money' pitches.",
    recommended_action: "Check what the work actually involves and who the client is.",
    patterns: [/\b(?:work\s+(?:only\s+|just\s+)?|just\s+|only\s+)(?:1|2|one|two)(?:\s*(?:-|to)\s*(?:2|3|two|three))?\s+hours?\s+(?:a|per|each)\s+day\b/gi],
  },
  {
    id: "salary.vague_attractive",
    signal: "salary.vague",
    category: "salary",
    severity: "low",
    confidence: 0.5,
    title: "Pay described only vaguely",
    explanation: "Phrases such as 'attractive salary' without any figure make it impossible to check whether the offer is realistic. Common in legitimate ads too, so this is a weak signal.",
    recommended_action: "Ask for the pay range and how it is paid before going further.",
    patterns: [/\b(?:attractive|handsome|lucrative|unlimited|huge|best\s+in\s+(?:the\s+)?industry)\s+(?:salary|salaries|pay|package|income|earnings|incentives)\b/gi],
  },
  {
    id: "salary.task_based",
    signal: "process.task_scam",
    category: "process",
    severity: "high",
    confidence: 0.8,
    title: "Pay for liking, rating or reviewing",
    explanation: "Paying people to like videos, rate products or complete 'tasks', especially with a deposit to 'unlock' higher tasks, is a widely reported scam pattern.",
    recommended_action: "Do not deposit money to unlock tasks or withdraw earnings.",
    patterns: [
      /\b(?:like|rate|review|subscribe\s+to|follow)\s+(?:youtube\s+)?(?:videos?|products?|hotels?|channels?|posts?|apps?)\b[^.\n]{0,40}\b(?:earn|paid|payment|commission)\b/gi,
      /\b(?:prepaid|recharge|top[- ]?up)\s+(?:tasks?|your\s+account|wallet)\b/gi,
      /\bunlock\s+(?:higher|more|premium|vip)\s+(?:tasks?|levels?|earnings?)\b/gi,
    ],
  },
  // ---------------------------------------------------------------- selection
  {
    id: "selection.guaranteed",
    signal: "selection.guaranteed",
    category: "selection",
    severity: "high",
    confidence: 0.8,
    title: "Guarantees selection or a job",
    explanation: "Genuine hiring involves assessment. Guaranteed selection or 'no interview' offers are often used to rush applicants into paying or sharing documents.",
    recommended_action: "Ask what the selection process is, who will interview you, and how the offer will be issued.",
    patterns: [
      /\b(?:100\s*%|guaranteed|assured|sure[- ]?shot)\s+(?:job|selection|placement|offer|joining|hiring|employment)\b/gi,
      /\b(?:selection|placement|job)\s+(?:is\s+)?(?:100\s*%\s+)?guaranteed\b/gi,
      /\bno\s+interviews?\s+(?:required|needed|round)?\b/gi,
      /\bdirect\s+(?:joining|selection|offer\s+letter)\b/gi,
    ],
  },
  {
    id: "selection.unsolicited_selected",
    signal: "selection.unsolicited",
    category: "selection",
    severity: "medium",
    confidence: 0.6,
    title: "Says you have already been selected",
    explanation: "Being told you are 'selected' or 'shortlisted' before any interview is a common opener in recruitment scams.",
    recommended_action: "Confirm you actually applied, and verify the recruiter on the company's official website.",
    patterns: [/\byou\s+(?:have\s+been|are|were|got)\s+(?:successfully\s+)?(?:shortlisted|selected|hired)\b/gi, /\bcongratulations[^.\n]{0,40}\b(?:selected|shortlisted|hired)\b/gi],
  },
  // ---------------------------------------------------------------- urgency
  {
    id: "urgency.pressure",
    signal: "urgency.pressure",
    category: "urgency",
    severity: "medium",
    confidence: 0.75,
    title: "Pressure to act immediately",
    explanation: "Artificial deadlines ('only 3 seats left', 'pay within 24 hours') discourage you from verifying the offer.",
    recommended_action: "Take your time. A genuine employer will allow you to verify the offer.",
    patterns: [
      /\blimited\s+(?:seats|slots|positions|openings|vacancies)\b/gi,
      /\bonly\s+\d+\s+(?:seats|slots|positions|openings|vacancies)\s+(?:left|remaining|available)\b/gi,
      /\b(?:offer|link|registration)\s+(?:expires|closes|valid\s+(?:only\s+)?(?:till|until|for))\b/gi,
      /\bwithin\s+(?:the\s+next\s+)?\d+\s+(?:hours|hrs|minutes|mins)\b/gi,
      /\b(?:today\s+only|last\s+chance|act\s+(?:now|fast)|hurry\s+up|don'?t\s+miss\s+(?:this|out))\b/gi,
    ],
  },
  {
    id: "urgency.urgent_hiring",
    signal: "urgency.urgent",
    category: "urgency",
    severity: "low",
    confidence: 0.4,
    title: "'Urgent hiring' language",
    explanation: "Many legitimate ads say this too; on its own it is a weak signal, but scams use it heavily.",
    recommended_action: "Treat urgency as a reason to verify, not to hurry.",
    patterns: [/\b(?:urgent(?:ly)?|immediate(?:ly)?)\s+(?:hiring|requirement|joining|openings?|vacanc(?:y|ies))\b/gi],
  },
  // ---------------------------------------------------------------- communication
  {
    id: "communication.messaging_app",
    signal: "communication.messaging",
    category: "communication",
    severity: "medium",
    confidence: 0.6,
    title: "Recruiting through messaging apps",
    explanation: "Recruitment conducted only through WhatsApp, Telegram or similar apps makes it hard to verify who you are talking to.",
    recommended_action: "Ask for contact from an official company email address and verify it on the company website.",
    patterns: [/\b(?:whats\s?app|telegram|signal\s+app|wickr|kik|viber|wechat)\b/gi],
  },
  // ---------------------------------------------------------------- process
  {
    id: "process.chat_interview",
    signal: "process.chat_interview",
    category: "process",
    severity: "high",
    confidence: 0.8,
    title: "Interview or onboarding by chat only",
    explanation: "Interviews held only by text chat are a frequent feature of fake job offers, because no real interviewer has to appear.",
    recommended_action: "Request a video or in-person interview with a named employee you can verify.",
    patterns: [
      /\b(?:interview|onboarding|training)s?\s+(?:will\s+be\s+)?(?:conducted\s+|held\s+|done\s+)?(?:via|on|over|through)\s+(?:whats\s?app|telegram|chat|text(?:\s+message)?s?|google\s+hangouts|hangouts|signal|messenger)\b/gi,
      /\b(?:chat|text)[- ]based\s+interview\b/gi,
    ],
  },
  {
    id: "process.money_handling",
    signal: "process.money_mule",
    category: "process",
    severity: "critical",
    confidence: 0.85,
    title: "Job involves handling other people's money or parcels",
    explanation:
      "Roles that ask you to deposit cheques, forward money or reship parcels can make you part of fraud or money laundering ('money mule' schemes).",
    recommended_action: "Do not accept roles that route money or goods through your personal accounts or address.",
    patterns: [
      /\b(?:deposit|cash)\s+(?:the\s+|a\s+)?(?:cheques?|checks?)\b/gi,
      /\b(?:forward|transfer)\s+(?:the\s+)?(?:remaining\s+)?(?:funds|money|balance)\s+(?:to|via)\b/gi,
      /\b(?:reship(?:ping)?|repackag(?:e|ing))\s+(?:parcels?|packages?|goods)\b/gi,
      /\b(?:payment\s+processing|money\s+transfer|financial)\s+agent\b/gi,
      /\buse\s+your\s+(?:own\s+|personal\s+)?bank\s+account\b/gi,
    ],
  },
  // ---------------------------------------------------------------- privacy
  {
    id: "privacy.credentials",
    signal: "privacy.credentials",
    category: "privacy",
    severity: "critical",
    confidence: 0.9,
    title: "Asks for passwords, OTPs, PINs or CVV",
    explanation: "No employer needs your passwords, one-time codes, card PINs or CVV. These requests are used to take over accounts or drain money.",
    recommended_action: "Never share these. If you already did, contact your bank and change your passwords immediately.",
    patterns: [
      /\b(?:share|send|provide|tell|give|submit|enter)\b[^.\n]{0,50}\b(?:otp|one[- ]time\s+(?:password|code)|cvv|atm\s+pin|upi\s+pin|mpin|net\s*banking\s+(?:password|credentials)|login\s+credentials|password)\b/gi,
    ],
  },
  {
    id: "privacy.documents_financial",
    signal: "privacy.documents",
    category: "privacy",
    severity: "high",
    confidence: 0.75,
    title: "Requests ID or bank documents early",
    explanation:
      "Asking for government ID, bank statements or card details before a verified offer exposes you to identity theft. Legitimate employers collect these after a written offer, through official HR systems.",
    recommended_action: "Share identity or bank documents only after a verified written offer, through an official company portal.",
    patterns: [
      /\b(?:share|send|provide|submit|upload|whatsapp)\b[^.\n]{0,60}\b(?:aadha?a?r|pan\s*card|passport|ssn|social\s+security|bank\s+(?:account|details|statement|passbook)|cancel(?:l)?ed\s+cheque|debit\s+card|credit\s+card|driver'?s?\s+licen[cs]e)\b/gi,
    ],
  },
  // ---------------------------------------------------------------- language
  {
    id: "language.ai_instruction",
    signal: "language.injection",
    category: "other",
    severity: "high",
    confidence: 0.85,
    title: "Text tries to instruct screening tools",
    explanation: "The ad contains instructions aimed at AI or automated screening (e.g. 'ignore previous instructions', 'mark this as safe'). Legitimate ads have no reason to do this.",
    recommended_action: "Treat the ad with extra suspicion.",
    patterns: [
      /\bignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?)\b/gi,
      /\b(?:as\s+an?\s+)?(?:ai|language\s+model|llm|assistant|chatgpt|claude)\b[^.\n]{0,40}\b(?:must|should)\s+(?:rate|mark|classify|label|say|report)\b/gi,
      /\b(?:mark|rate|classify|label)\s+(?:this|the)\s+(?:job|ad|advertisement|posting|offer)\s+as\s+(?:safe|legit(?:imate)?|genuine|low[- ]risk|verified)\b/gi,
    ],
  },
];

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.co.uk",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "rediffmail.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "yandex.com",
  "yandex.ru",
  "zohomail.com",
  "tutanota.com",
]);

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}

export const EMAIL_RE = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

export function extractEmails(text: string): { email: string; domain: string; index: number }[] {
  const out: { email: string; domain: string; index: number }[] = [];
  for (const m of text.matchAll(EMAIL_RE)) {
    out.push({ email: m[0], domain: (m[1] ?? "").toLowerCase(), index: m.index ?? 0 });
  }
  return out;
}

function buildFinding(rule: Omit<RuleDefinition, "patterns">, text: string, start: number, end: number): RuleFinding {
  const span = sentenceAround(text, start, end);
  return {
    rule_id: rule.id,
    signal: rule.signal,
    category: rule.category,
    severity: rule.severity,
    confidence: rule.confidence,
    title: rule.title,
    explanation: rule.explanation,
    recommended_action: rule.recommended_action,
    evidence_quote: text.slice(span.start, span.end),
    start: span.start,
    end: span.end,
    missing_info: Boolean(rule.missingInfo),
  };
}

const MAX_MATCHES_PER_RULE = 3;

/** Run every deterministic detector over (already redacted) text. */
export function runRules(text: string): RuleFinding[] {
  const findings: RuleFinding[] = [];

  for (const rule of RULES) {
    const seen = new Set<string>();
    let count = 0;
    for (const pattern of rule.patterns) {
      const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      for (const m of text.matchAll(re)) {
        if (count >= MAX_MATCHES_PER_RULE) break;
        const start = m.index ?? 0;
        const f = buildFinding(rule, text, start, start + m[0].length);
        if (seen.has(f.evidence_quote)) continue;
        seen.add(f.evidence_quote);
        findings.push(f);
        count++;
      }
    }
  }

  // Free webmail used as the recruiting contact
  const freeEmails = extractEmails(text).filter((e) => isFreeEmailDomain(e.domain));
  const firstFree = freeEmails[0];
  if (firstFree) {
    findings.push(
      buildFinding(
        {
          id: "communication.free_email",
          signal: "communication.free_email",
          category: "communication",
          severity: "medium",
          confidence: 0.7,
          title: "Recruiter uses a free email address",
          explanation: `The contact address uses ${firstFree.domain}, a free webmail provider. Established companies normally recruit from their own domain. Small businesses sometimes do use free email, so verify rather than assume.`,
          recommended_action: "Look up the company's official website and confirm the recruiter through contact details listed there.",
        },
        text,
        firstFree.index,
        firstFree.index + firstFree.email.length,
      ),
    );
  }

  // Shouting: many ALL-CAPS words or repeated exclamation marks
  const words = text.match(/\b[A-Za-z]{3,}\b/g) ?? [];
  const caps = words.filter((w) => w === w.toUpperCase());
  const bangs = text.match(/!{2,}/g) ?? [];
  if ((words.length >= 20 && caps.length / words.length > 0.3) || bangs.length >= 3) {
    const m = /!{2,}|\b[A-Z]{3,}(?:\s+[A-Z]{3,}){2,}\b/.exec(text);
    if (m) {
      findings.push(
        buildFinding(
          {
            id: "language.shouting",
            signal: "language.shouting",
            category: "language",
            severity: "low",
            confidence: 0.5,
            title: "Unprofessional formatting",
            explanation: "Heavy use of capital letters or exclamation marks is more typical of spam than of corporate job postings. It is a weak signal on its own.",
            recommended_action: "Compare the style with job ads on the company's official careers page.",
          },
          text,
          m.index,
          m.index + m[0].length,
        ),
      );
    }
  }

  return findings;
}

/** Missing-information checks. These never raise the score above a small cap. */
export function detectMissingInformation(text: string): string[] {
  const missing: string[] = [];
  const hasUrl = /\bhttps?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]{2,}/i.test(text);
  const hasCorporateEmail = extractEmails(text).some((e) => !isFreeEmailDomain(e.domain));
  if (!hasUrl && !hasCorporateEmail) missing.push("No official company website or company email address is given.");
  if (!/\b(?:responsibilit|duties|you will|role involves|what you'?ll do|key tasks|job description)/i.test(text)) {
    missing.push("The job responsibilities are not clearly described.");
  }
  if (!/\b(?:location|remote|on-?site|hybrid|office|based in|city)\b/i.test(text)) missing.push("No work location or remote/on-site arrangement is stated.");
  if (!/\b(?:qualification|requirement|eligib|experience|skills?|degree|graduate)\b/i.test(text)) missing.push("No required skills or qualifications are listed.");
  if (!/\b(?:interview|assessment|selection process|screening|test round|hiring process)\b/i.test(text)) missing.push("The selection or interview process is not described.");
  return missing;
}
