/**
 * Minimal, non-executing HTML-to-text extraction. We never build a DOM or run
 * scripts: markup is removed with regular expressions and entities decoded.
 * JSON-LD JobPosting blocks are parsed as data (JSON.parse only).
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  rupee: "₹",
  pound: "£",
  euro: "€",
  copy: "©",
  reg: "®",
  trade: "™",
  bull: "•",
  middot: "·",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n < 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return "";
      return String.fromCodePoint(n);
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template|svg|iframe|object|embed|canvas|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|ul|ol|table|blockquote|pre)\s*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractTitle(html: string): string | null {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const t = m?.[1] ? decodeEntities(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim() : "";
  return t ? t.slice(0, 300) : null;
}

export function extractMetaDescription(html: string): string | null {
  const m = /<meta\b[^>]*name=["']description["'][^>]*>/i.exec(html) ?? /<meta\b[^>]*property=["']og:description["'][^>]*>/i.exec(html);
  const c = m ? /content=["']([^"']*)["']/i.exec(m[0]) : null;
  const v = c?.[1] ? decodeEntities(c[1]).trim() : "";
  return v ? v.slice(0, 500) : null;
}

export interface JobPostingData {
  title: string | null;
  hiringOrganization: string | null;
  organizationUrl: string | null;
  datePosted: string | null;
  validThrough: string | null;
  employmentType: string | null;
  location: string | null;
  salary: string | null;
  description: string | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null;
}

function findJobPosting(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || depth > 5) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findJobPosting(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  const type = o["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return o;
  if (o["@graph"]) return findJobPosting(o["@graph"], depth + 1);
  return null;
}

/** Extract schema.org JobPosting structured data, if present. */
export function extractJobPosting(html: string): JobPostingData | null {
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const raw = m[1];
    if (!raw || raw.length > 200_000) continue;
    let data: unknown;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const jp = findJobPosting(data);
    if (!jp) continue;
    const org = jp.hiringOrganization as Record<string, unknown> | string | undefined;
    const loc = Array.isArray(jp.jobLocation) ? jp.jobLocation[0] : jp.jobLocation;
    const address = (loc as Record<string, unknown> | undefined)?.address as Record<string, unknown> | undefined;
    const salary = jp.baseSalary as Record<string, unknown> | undefined;
    const salaryValue = salary?.value as Record<string, unknown> | undefined;
    const salaryText = salary
      ? [str(salary.currency), salaryValue?.minValue ?? salaryValue?.value, salaryValue?.maxValue ? `– ${salaryValue.maxValue}` : null, str(salaryValue?.unitText)]
          .filter((x) => x !== null && x !== undefined && x !== "")
          .join(" ")
      : null;
    const desc = str(jp.description) ? htmlToText(String(jp.description)).slice(0, 4000) : null;
    return {
      title: str(jp.title),
      hiringOrganization: typeof org === "string" ? str(org) : str(org?.name),
      organizationUrl: typeof org === "object" ? (str(org?.sameAs) ?? str(org?.url)) : null,
      datePosted: str(jp.datePosted),
      validThrough: str(jp.validThrough),
      employmentType: Array.isArray(jp.employmentType) ? jp.employmentType.filter((x) => typeof x === "string").join(", ") : str(jp.employmentType),
      location: address ? [str(address.addressLocality), str(address.addressRegion), str(address.addressCountry)].filter(Boolean).join(", ") || null : null,
      salary: salaryText || null,
      description: desc,
    };
  }
  return null;
}
