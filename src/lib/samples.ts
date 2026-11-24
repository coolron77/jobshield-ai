/**
 * Clearly labelled FICTIONAL sample advertisements for demonstration and tests.
 * Company names, domains and contacts are invented; example.* domains are
 * reserved for documentation (RFC 2606).
 */

export interface SampleAd {
  id: string;
  label: string;
  description: string;
  expected: "low" | "medium" | "high" | "critical";
  companyName: string;
  text: string;
}

export const SAMPLE_ADS: SampleAd[] = [
  {
    id: "fee-scam",
    label: "Sample: data-entry job with a 'registration fee'",
    description: "Fictional ad showing several classic warning signs.",
    expected: "critical",
    companyName: "Global Data Solutions",
    text: `URGENT HIRING!!! Work From Home Data Entry Executive – Global Data Solutions

Congratulations, you have been shortlisted! 100% job guarantee, no interview required.
Earn ₹25,000 per week working just 2 hours a day. Freshers welcome, no experience needed.

To confirm your seat, pay a refundable registration fee of ₹1,999 within 24 hours. Only 5 seats left!
Fee is 100% refundable with your first salary.

Send your Aadhaar card, PAN card and bank details on WhatsApp to our HR manager.
Contact: globaldatasolutions.hr@gmail.com`,
  },
  {
    id: "task-scam",
    label: "Sample: 'like videos and earn' part-time task",
    description: "Fictional task-based scam using a messaging app.",
    expected: "critical",
    companyName: "StarReach Media",
    text: `Part-time opportunity with StarReach Media. Like YouTube videos and earn commission of $5 per task. Daily payouts guaranteed income!

Interview will be conducted via Telegram chat. After training, top up your account to unlock higher tasks and earn more.
Limited slots – act now. Message our coordinator on Telegram to start today.`,
  },
  {
    id: "legit-internship",
    label: "Sample: detailed software internship",
    description: "Fictional posting with typical credibility signals.",
    expected: "low",
    companyName: "Northwind Analytics",
    text: `Software Engineering Intern (Summer 2027) – Northwind Analytics

Location: Bengaluru, hybrid (3 days in office)
Duration: 12 weeks, stipend ₹40,000 per month

About the role
You will join the data platform team and work on internal tools written in TypeScript and Python. Responsibilities include writing and reviewing code, adding automated tests, and presenting your project to the team at the end of the internship.

Requirements
- Currently pursuing a B.Tech/B.E. or equivalent degree in computer science or a related field
- Familiarity with at least one programming language
- Good written communication skills

Hiring process
Online application, a 60-minute technical assessment, and two video interviews with engineers from the team. We never charge candidates any fee at any stage of the hiring process.

Apply through our careers page at https://careers.northwind.example/internships or email campus@northwind.example with questions.`,
  },
  {
    id: "ambiguous",
    label: "Sample: vague marketing role with free email",
    description: "Fictional ad that is missing key information.",
    expected: "medium",
    companyName: "BrightPath Ventures",
    text: `BrightPath Ventures is hiring Marketing Associates. Immediate joining. Attractive salary and incentives.

Good communication skills required. Interested candidates can send their CV to brightpath.careers@yahoo.com and our team will contact you on WhatsApp.`,
  },
];

export function getSample(id: string): SampleAd | undefined {
  return SAMPLE_ADS.find((s) => s.id === id);
}
