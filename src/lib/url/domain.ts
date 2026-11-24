/**
 * Domain helpers. getRegistrableDomain is an approximation of the Public
 * Suffix List covering common multi-part suffixes; it is used for comparing
 * domains, never for legal or ownership conclusions.
 */

const MULTI_PART_SUFFIXES = new Set([
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "ac.in", "edu.in", "res.in", "gov.in", "nic.in",
  "co.uk", "org.uk", "ac.uk", "gov.uk", "ltd.uk", "plc.uk", "me.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.nz", "org.nz", "com.sg", "edu.sg", "gov.sg", "com.my", "com.ph", "com.pk", "com.bd", "com.np", "com.lk",
  "co.za", "com.ng", "co.ke", "com.eg", "com.br", "com.mx", "com.ar", "co.jp", "ne.jp", "or.jp", "co.kr", "com.cn", "com.hk", "com.tw",
  "ae.org", "com.sa", "co.id", "or.id", "com.tr", "com.ua",
]);

export function getRegistrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

export function getTld(domain: string): string {
  return domain.split(".").pop() ?? "";
}

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const URL_SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "rb.gy", "is.gd", "shorturl.at", "tiny.cc", "ow.ly", "buff.ly", "rebrand.ly", "t.ly", "s.id", "bl.ink", "lnkd.in",
]);

export const MESSAGING_LINK_HOSTS = new Set(["wa.me", "api.whatsapp.com", "chat.whatsapp.com", "t.me", "telegram.me", "m.me", "signal.me"]);

/** Platforms where anyone can publish a page or form. */
export const GENERAL_HOSTING_SUFFIXES = [
  "forms.gle", "docs.google.com", "sites.google.com", "blogspot.com", "wixsite.com", "weebly.com", "wordpress.com", "github.io",
  "netlify.app", "vercel.app", "pages.dev", "web.app", "firebaseapp.com", "glitch.me", "linktr.ee", "carrd.co", "notion.site",
  "typeform.com", "jotform.com", "forms.office.com", "000webhostapp.com", "godaddysites.com", "mystrikingly.com",
];

/** Well-known job platforms. Listings there are still posted by third parties. */
export const KNOWN_JOB_PLATFORMS = new Set([
  "linkedin.com", "indeed.com", "naukri.com", "internshala.com", "glassdoor.com", "glassdoor.co.in", "monster.com", "foundit.in",
  "wellfound.com", "shine.com", "timesjobs.com", "apna.co", "workindia.in", "unstop.com", "ziprecruiter.com", "reed.co.uk",
  "seek.com.au", "jobstreet.com", "bayt.com", "greenhouse.io", "lever.co", "workday.com", "myworkdayjobs.com", "smartrecruiters.com", "ashbyhq.com",
]);

export function matchesSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/** Levenshtein distance (small strings only). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0] as number;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j] as number;
      dp[j] = Math.min((dp[j] as number) + 1, (dp[j - 1] as number) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length] as number;
}

/** Tokens of a company name useful for loose domain comparison. */
export function companyTokens(name: string): string[] {
  const stop = new Set(["pvt", "private", "ltd", "limited", "inc", "llc", "llp", "corp", "corporation", "co", "company", "the", "and", "group", "solutions", "services", "technologies", "technology", "tech", "global", "india", "international"]);
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stop.has(t));
}
