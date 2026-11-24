import { JSON_TYPES, safeFetch, type SafeFetchOptions } from "@/lib/url/fetcher";
import { getTld } from "@/lib/url/domain";

/**
 * Domain registration data via RDAP (the IETF successor to WHOIS), using the
 * official IANA bootstrap registry to find the authoritative server. RDAP
 * tells us when a DOMAIN was registered — it says nothing about whether a
 * COMPANY is legally registered or legitimate.
 */

export const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";

let bootstrapCache: { fetchedAt: number; services: [string[], string[]][] } | null = null;
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;

export interface RdapResult {
  domain: string;
  source: string;
  registrationDate: string | null;
  expirationDate: string | null;
  lastChanged: string | null;
  registrar: string | null;
  status: string[];
}

export type Fetcher = (url: string, opts: SafeFetchOptions) => Promise<{ body: string }>;

async function getBootstrap(fetcher: Fetcher): Promise<[string[], string[]][]> {
  if (bootstrapCache && Date.now() - bootstrapCache.fetchedAt < BOOTSTRAP_TTL_MS) return bootstrapCache.services;
  const res = await fetcher(IANA_BOOTSTRAP_URL, { allowedContentTypes: JSON_TYPES, maxBytes: 1_000_000, timeoutMs: 6000 });
  const data = JSON.parse(res.body) as { services?: [string[], string[]][] };
  if (!Array.isArray(data.services)) throw new Error("Invalid RDAP bootstrap file");
  bootstrapCache = { fetchedAt: Date.now(), services: data.services };
  return data.services;
}

function vcardName(entity: Record<string, unknown>): string | null {
  const vcard = entity.vcardArray as unknown[] | undefined;
  const props = Array.isArray(vcard?.[1]) ? (vcard[1] as unknown[][]) : [];
  const fn = props.find((p) => Array.isArray(p) && p[0] === "fn");
  return typeof fn?.[3] === "string" ? fn[3].slice(0, 200) : null;
}

export function parseRdap(domain: string, source: string, body: string): RdapResult {
  const data = JSON.parse(body) as Record<string, unknown>;
  const events = Array.isArray(data.events) ? (data.events as Record<string, unknown>[]) : [];
  const ev = (action: string) => {
    const e = events.find((x) => x.eventAction === action);
    return typeof e?.eventDate === "string" ? e.eventDate : null;
  };
  const entities = Array.isArray(data.entities) ? (data.entities as Record<string, unknown>[]) : [];
  const registrarEntity = entities.find((e) => Array.isArray(e.roles) && (e.roles as unknown[]).includes("registrar"));
  return {
    domain,
    source,
    registrationDate: ev("registration"),
    expirationDate: ev("expiration"),
    lastChanged: ev("last changed"),
    registrar: registrarEntity ? vcardName(registrarEntity) : null,
    status: Array.isArray(data.status) ? (data.status as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 10) : [],
  };
}

export async function lookupDomainRegistration(domain: string, fetcher: Fetcher = safeFetch): Promise<RdapResult | null> {
  const tld = getTld(domain).toLowerCase();
  const services = await getBootstrap(fetcher);
  const service = services.find(([tlds]) => tlds.map((t) => t.toLowerCase()).includes(tld));
  const base = service?.[1].find((u) => u.startsWith("https://")) ?? service?.[1][0];
  if (!base) return null;
  const url = `${base.endsWith("/") ? base : base + "/"}domain/${encodeURIComponent(domain)}`;
  const res = await fetcher(url, { allowedContentTypes: JSON_TYPES, maxBytes: 512_000, timeoutMs: 6000 });
  return parseRdap(domain, url, res.body);
}

export function resetRdapCacheForTests(): void {
  bootstrapCache = null;
}
