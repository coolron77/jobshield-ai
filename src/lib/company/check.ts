import { z } from "zod";
import dns from "node:dns";
import { isFreeEmailDomain } from "@/lib/analysis/rules";
import { companyTokens, editDistance, getRegistrableDomain, hostnameOf } from "@/lib/url/domain";
import { inspectUrl, type UrlInspection } from "@/lib/url/inspect";
import { isBlockedAddress, validatePublicUrl } from "@/lib/url/ssrf";
import { lookupDomainRegistration, type RdapResult } from "./rdap";

/**
 * Company information checks. Output is split into four clearly separated
 * buckets so the UI can never present a claim as a verified fact:
 *
 *   checked     — something JobShield actually looked up, with source + time
 *   claims      — what the user told us (unverified)
 *   observations— comparisons/heuristics derived from the above (cautions)
 *   not_checked — what we did NOT verify (legal registration, reviews,
 *                 ownership), with pointers to official sources
 */

export const CompanyCheckInputSchema = z.object({
  company_name: z.string().trim().min(2, "Enter the company name.").max(200),
  website: z.string().trim().max(2048).optional().or(z.literal("")),
  recruiter_email: z.string().trim().max(320).email("Enter a valid email address.").optional().or(z.literal("")),
  recruiter_domain: z.string().trim().max(253).optional().or(z.literal("")),
  other_info: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type CompanyCheckInput = z.infer<typeof CompanyCheckInputSchema>;

export interface CheckedFact {
  label: string;
  value: string;
  source: string;
  checked_at: string;
}

export interface Observation {
  severity: "info" | "caution" | "warning";
  message: string;
}

export interface CompanyCheckResult {
  checked: CheckedFact[];
  claims: { label: string; value: string }[];
  observations: Observation[];
  not_checked: { label: string; detail: string }[];
  official_registries: { name: string; url: string; region: string }[];
}

export const OFFICIAL_REGISTRIES = [
  { name: "Ministry of Corporate Affairs (MCA) — company master data", url: "https://www.mca.gov.in/", region: "India" },
  { name: "Companies House — find and update company information", url: "https://find-and-update.company-information.service.gov.uk/", region: "United Kingdom" },
  { name: "SEC EDGAR — company search", url: "https://www.sec.gov/edgar/search/", region: "United States (public companies)" },
  { name: "OpenCorporates — aggregated registry data", url: "https://opencorporates.com/", region: "Multiple countries (third-party aggregator)" },
];

export interface CompanyCheckDeps {
  resolveDns: (host: string) => Promise<string[]>;
  rdap: (domain: string) => Promise<RdapResult | null>;
  inspect: (url: string) => Promise<UrlInspection>;
  now: () => Date;
}

export const defaultCompanyDeps: CompanyCheckDeps = {
  resolveDns: async (host) => (await dns.promises.lookup(host, { all: true })).map((a) => a.address),
  rdap: (domain) => lookupDomainRegistration(domain),
  inspect: (url) => inspectUrl(url),
  now: () => new Date(),
};

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

export async function checkCompany(input: CompanyCheckInput, deps: CompanyCheckDeps = defaultCompanyDeps): Promise<CompanyCheckResult> {
  const checked: CheckedFact[] = [];
  const claims: { label: string; value: string }[] = [];
  const observations: Observation[] = [];
  const stamp = () => deps.now().toISOString();

  claims.push({ label: "Company name", value: input.company_name });
  if (input.website) claims.push({ label: "Official website (as provided)", value: input.website });
  if (input.recruiter_email) claims.push({ label: "Recruiter email", value: input.recruiter_email });
  if (input.recruiter_domain) claims.push({ label: "Recruiter domain", value: input.recruiter_domain });
  if (input.other_info) claims.push({ label: "Other information", value: input.other_info });

  // ----- Website -------------------------------------------------------------
  let websiteDomain: string | null = null;
  if (input.website) {
    const v = validatePublicUrl(input.website);
    if (!v.ok) {
      observations.push({ severity: "caution", message: `The website could not be checked: ${v.error}` });
    } else {
      websiteDomain = getRegistrableDomain(v.url.hostname);
      const inspection = await deps.inspect(v.url.toString());
      if (inspection.summary.fetched) {
        checked.push({
          label: "Website responded",
          value: `HTTP ${inspection.summary.status} from ${inspection.summary.final_url}${inspection.summary.redirects.length ? ` after ${inspection.summary.redirects.length} redirect(s)` : ""}`,
          source: "Direct HTTPS request by JobShield",
          checked_at: inspection.summary.retrieved_at,
        });
        if (inspection.title) checked.push({ label: "Website page title", value: inspection.title, source: inspection.summary.final_url ?? v.url.toString(), checked_at: inspection.summary.retrieved_at });
        const tokens = companyTokens(input.company_name);
        const haystack = `${inspection.title ?? ""} ${inspection.pageText ?? ""}`.toLowerCase();
        const mentioned = tokens.length > 0 && tokens.every((t) => haystack.includes(t));
        checked.push({
          label: "Company name appears on the homepage",
          value: mentioned ? "Yes" : tokens.length === 0 ? "Not determined (name too generic to compare)" : "No — the fetched page does not mention this name",
          source: inspection.summary.final_url ?? v.url.toString(),
          checked_at: inspection.summary.retrieved_at,
        });
        if (tokens.length > 0 && !mentioned) observations.push({ severity: "caution", message: "The website's homepage does not mention the company name you entered. Make sure this is really the company's own site." });
        for (const note of inspection.summary.notes) observations.push({ severity: "caution", message: note });
        const finalHost = inspection.summary.final_url ? hostnameOf(inspection.summary.final_url) : null;
        if (finalHost) websiteDomain = getRegistrableDomain(finalHost);
      } else {
        checked.push({ label: "Website responded", value: `No — ${inspection.summary.error ?? "unreachable"}`, source: "Direct HTTPS request by JobShield", checked_at: inspection.summary.retrieved_at });
        observations.push({ severity: "caution", message: "The website could not be reached. A company without a working website is harder to verify." });
      }
    }
  }

  // ----- Recruiter email / domain -----------------------------------------
  const emailDomain = input.recruiter_email ? (input.recruiter_email.split("@")[1] ?? "").toLowerCase() : null;
  const recruiterDomainRaw = (input.recruiter_domain || emailDomain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const recruiterDomain = recruiterDomainRaw ? getRegistrableDomain(recruiterDomainRaw) : null;

  if (recruiterDomain) {
    if (isFreeEmailDomain(recruiterDomainRaw)) {
      observations.push({
        severity: "warning",
        message: `The recruiter uses ${recruiterDomainRaw}, a free email service. Established companies usually recruit from their own domain; confirm this person through the company's official website.`,
      });
    } else {
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(recruiterDomain)) {
        try {
          const addrs = await deps.resolveDns(recruiterDomain);
          const publicAddrs = addrs.filter((a) => !isBlockedAddress(a));
          checked.push({
            label: `DNS for ${recruiterDomain}`,
            value: publicAddrs.length ? `Resolves (${publicAddrs.length} public address${publicAddrs.length === 1 ? "" : "es"})` : "Resolves only to non-public addresses",
            source: "DNS lookup",
            checked_at: stamp(),
          });
        } catch {
          checked.push({ label: `DNS for ${recruiterDomain}`, value: "Does not resolve", source: "DNS lookup", checked_at: stamp() });
          observations.push({ severity: "warning", message: `The recruiter's domain ${recruiterDomain} does not resolve in DNS, so emails from it may not be genuine.` });
        }
      }
      if (websiteDomain) {
        if (recruiterDomain === websiteDomain) {
          checked.push({ label: "Recruiter domain matches website domain", value: `Yes (${recruiterDomain})`, source: "Comparison of the values you entered", checked_at: stamp() });
        } else {
          const close = editDistance(recruiterDomain.split(".")[0] ?? "", websiteDomain.split(".")[0] ?? "") <= 2;
          observations.push({
            severity: "warning",
            message: close
              ? `The recruiter domain (${recruiterDomain}) looks similar to, but is different from, the website domain (${websiteDomain}). Look-alike domains are a common impersonation technique.`
              : `The recruiter domain (${recruiterDomain}) does not match the website domain (${websiteDomain}). Ask why, and verify the recruiter through the website.`,
          });
        }
      } else {
        const tokens = companyTokens(input.company_name);
        if (tokens.length && !tokens.some((t) => recruiterDomain.includes(t))) {
          observations.push({ severity: "info", message: `The recruiter domain (${recruiterDomain}) does not contain the company name. That can be normal (e.g. a parent company), but it is worth checking.` });
        }
      }
    }
  }

  // ----- Domain registration (RDAP) ----------------------------------------
  const rdapTargets = [...new Set([websiteDomain, recruiterDomain && !isFreeEmailDomain(recruiterDomainRaw) ? recruiterDomain : null].filter((d): d is string => Boolean(d)))];
  for (const domain of rdapTargets) {
    try {
      const r = await deps.rdap(domain);
      if (!r) {
        checked.push({ label: `Domain registration for ${domain}`, value: "Not available — no RDAP service for this domain extension", source: "IANA RDAP bootstrap registry", checked_at: stamp() });
        continue;
      }
      checked.push({
        label: `Domain registration for ${domain}`,
        value: [
          r.registrationDate ? `registered ${r.registrationDate.slice(0, 10)}` : "registration date not published",
          r.registrar ? `registrar: ${r.registrar}` : null,
          r.expirationDate ? `expires ${r.expirationDate.slice(0, 10)}` : null,
        ]
          .filter(Boolean)
          .join("; "),
        source: r.source,
        checked_at: stamp(),
      });
      if (r.registrationDate) {
        const age = daysBetween(deps.now(), new Date(r.registrationDate));
        if (age >= 0 && age < 180) {
          observations.push({ severity: "warning", message: `${domain} was registered only ${age} day(s) ago. Very new domains are common in recruitment scams, though new businesses also start this way.` });
        }
      }
    } catch {
      checked.push({ label: `Domain registration for ${domain}`, value: "Lookup failed or timed out", source: "RDAP", checked_at: stamp() });
    }
  }

  if (!input.website && !recruiterDomain) {
    observations.push({ severity: "caution", message: "No website or recruiter domain was provided, so no online checks could be run." });
  }

  return {
    checked,
    claims,
    observations,
    not_checked: [
      { label: "Legal company registration", detail: "JobShield did not check any company registry. Search the official registry for the company's country (links below)." },
      { label: "Company reviews and reputation", detail: "Not checked. Look for independent reviews and news coverage, and be wary of reviews posted on the recruiter's own site." },
      { label: "Website ownership", detail: "Domain registration data rarely names the owner and does not prove that the company in the ad operates the site." },
      { label: "Recruiter identity", detail: "Not checked. Confirm the recruiter through contact details on the company's official website, not those in the ad." },
    ],
    official_registries: OFFICIAL_REGISTRIES,
  };
}
