import { runRules, type RuleFinding } from "@/lib/analysis/rules";
import { redactSensitive } from "@/lib/analysis/redact";
import type { UrlSummary } from "@/lib/analysis/schema";
import { GENERAL_HOSTING_SUFFIXES, KNOWN_JOB_PLATFORMS, MESSAGING_LINK_HOSTS, URL_SHORTENERS, getRegistrableDomain, hostnameOf, matchesSuffix } from "./domain";
import { SafeFetchError, safeFetch, type SafeFetchOptions } from "./fetcher";
import { extractJobPosting, extractMetaDescription, extractTitle, htmlToText, type JobPostingData } from "./html";
import { validatePublicUrl } from "./ssrf";

export interface UrlInspection {
  summary: UrlSummary;
  title: string | null;
  description: string | null;
  contentType: string | null;
  truncated: boolean;
  pageText: string | null;
  jobPosting: JobPostingData | null;
  findings: RuleFinding[];
}

export const MAX_PAGE_TEXT = 12000;

/** Notes about the URL itself that need no network access. */
export function describeUrl(url: string, finalUrl: string | null): string[] {
  const notes: string[] = [];
  const host = hostnameOf(url);
  const finalHost = finalUrl ? hostnameOf(finalUrl) : null;
  if (!host) return notes;
  const hosts = [host, ...(finalHost && finalHost !== host ? [finalHost] : [])];

  if (url.startsWith("http://") && (!finalUrl || finalUrl.startsWith("http://"))) notes.push("The link does not use HTTPS, so the connection is not encrypted.");
  if (hosts.some((h) => h.split(".").some((l) => l.startsWith("xn--")))) {
    notes.push("The domain uses internationalised (punycode) characters, which can be used to imitate well-known domains. Check the spelling carefully.");
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) notes.push("The link uses a raw IP address instead of a domain name, which is unusual for employers.");
  if (URL_SHORTENERS.has(host)) {
    notes.push(finalHost && finalHost !== host ? `This is a shortened link; it leads to ${finalHost}.` : "This is a shortened link that hides its real destination.");
  }
  for (const h of hosts) {
    if (MESSAGING_LINK_HOSTS.has(h)) notes.push(`The link opens a messaging chat (${h}) rather than a company website.`);
    const hosting = GENERAL_HOSTING_SUFFIXES.find((s) => matchesSuffix(h, s));
    if (hosting) notes.push(`The page is hosted on ${hosting}, a general-purpose platform where anyone can publish pages or forms. It does not show who operates it.`);
    const reg = getRegistrableDomain(h);
    if (KNOWN_JOB_PLATFORMS.has(reg)) notes.push(`${reg} is a widely used job platform. Listings there are posted by third parties, so the employer still needs to be verified.`);
  }
  if (finalHost && getRegistrableDomain(finalHost) !== getRegistrableDomain(host) && !URL_SHORTENERS.has(host)) {
    notes.push(`The link redirected from ${host} to a different domain (${finalHost}).`);
  }
  return [...new Set(notes)];
}

export async function inspectUrl(input: string, options: SafeFetchOptions = {}, now: () => Date = () => new Date()): Promise<UrlInspection> {
  const validation = validatePublicUrl(input, { extraAllowedPorts: options.extraAllowedPorts });
  const retrieved_at = now().toISOString();
  if (!validation.ok) {
    return {
      summary: { submitted_url: input.slice(0, 2048), final_url: null, domain: null, redirects: [], status: null, fetched: false, error: validation.error, notes: [], retrieved_at },
      title: null,
      description: null,
      contentType: null,
      truncated: false,
      pageText: null,
      jobPosting: null,
      findings: [],
    };
  }
  const submitted = validation.url.toString();
  try {
    const res = await safeFetch(submitted, options);
    const isHtml = /html|xml/i.test(res.contentType);
    const rawText = isHtml ? htmlToText(res.body) : res.body.replace(/\s+\n/g, "\n").trim();
    const jobPosting = isHtml ? extractJobPosting(res.body) : null;
    // Prefer the structured job description when the page offers one.
    const textForAnalysis = (jobPosting?.description && jobPosting.description.length > 200 ? jobPosting.description : rawText).slice(0, MAX_PAGE_TEXT);
    const pageText = redactSensitive(textForAnalysis).text;
    return {
      summary: {
        submitted_url: submitted,
        final_url: res.finalUrl,
        domain: hostnameOf(res.finalUrl),
        redirects: res.redirects,
        status: res.status,
        fetched: true,
        error: null,
        notes: describeUrl(submitted, res.finalUrl),
        retrieved_at,
      },
      title: isHtml ? extractTitle(res.body) : null,
      description: isHtml ? extractMetaDescription(res.body) : null,
      contentType: res.contentType.split(";")[0] ?? null,
      truncated: res.truncated || textForAnalysis.length >= MAX_PAGE_TEXT,
      pageText: pageText || null,
      jobPosting,
      findings: pageText ? runRules(pageText) : [],
    };
  } catch (err) {
    const message = err instanceof SafeFetchError ? err.message : "The page could not be inspected.";
    const details = err instanceof SafeFetchError ? err.details : {};
    const lastHop = details.redirects?.[details.redirects.length - 1] ?? null;
    return {
      summary: {
        submitted_url: submitted,
        final_url: lastHop,
        domain: hostnameOf(submitted),
        redirects: details.redirects ?? [],
        status: details.status ?? null,
        fetched: false,
        error: message,
        notes: describeUrl(submitted, lastHop),
        retrieved_at,
      },
      title: null,
      description: null,
      contentType: null,
      truncated: false,
      pageText: null,
      jobPosting: null,
      findings: [],
    };
  }
}
