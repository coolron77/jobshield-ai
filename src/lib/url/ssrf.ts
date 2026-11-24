import { BlockList, isIP } from "node:net";

/**
 * SSRF protection primitives.
 *
 * - Only http/https, only ports 80/443, no embedded credentials.
 * - Hostnames such as localhost, *.local, *.internal and single-label names
 *   are rejected before DNS.
 * - Every resolved address is checked against the blocklist below at socket
 *   connect time (see fetcher.ts), which also defeats DNS rebinding: the
 *   address we validate is the address we connect to.
 */

// Separate lists: Node's BlockList treats IPv4 and IPv4-mapped IPv6 as
// equivalent, so mixing families in one list would let a ::ffff:0:0/96 entry
// match every IPv4 address. Mapped/NAT64 forms are handled explicitly below.
const v4List = new BlockList();
const v6List = new BlockList();
// IPv4 special-purpose ranges (RFC 6890 and friends)
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["192.175.48.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  v4List.addSubnet(net, prefix, "ipv4");
}
// IPv6 special-purpose ranges
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard
  ["2001::", 23], // IETF protocol assignments incl. Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const) {
  v6List.addSubnet(net, prefix, "ipv6");
}

/** Expand an IPv6 address to 8 numeric hextets (handles :: and embedded IPv4). */
export function expandIPv6(ip: string): number[] | null {
  let addr = ip;
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(addr);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    addr = addr.slice(0, v4.index) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const parts = [...head, ...Array(Math.max(fill, 0)).fill("0"), ...tail];
  if (parts.length !== 8) return null;
  const nums = parts.map((p) => Number.parseInt(p, 16));
  return nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? nums : null;
}

export function isBlockedAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "").split("%")[0] as string; // strip brackets / zone id
  const family = isIP(bare);
  if (family === 4) return v4List.check(bare, "ipv4");
  if (family === 6) {
    const h = expandIPv6(bare);
    if (!h) return true;
    // IPv4-mapped (::ffff:0:0/96), IPv4-compatible (::/96) and NAT64 (64:ff9b::/96): never needed for job sites.
    if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) return true;
    if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) return true;
    return v6List.check(bare, "ipv6");
  }
  return true; // not an IP at all → refuse
}

export const ALLOWED_PORTS = new Set(["", "80", "443"]);
export const MAX_URL_LENGTH = 2048;

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".corp", ".localdomain", ".home.arpa"];

export type UrlValidation = { ok: true; url: URL } | { ok: false; error: string };

export function validatePublicUrl(input: string, opts: { extraAllowedPorts?: string[] } = {}): UrlValidation {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Enter a URL." };
  if (trimmed.length > MAX_URL_LENGTH) return { ok: false, error: "URL is too long." };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "Only http and https links can be checked." };
  if (url.username || url.password) return { ok: false, error: "Links containing usernames or passwords are not allowed." };
  if (!ALLOWED_PORTS.has(url.port) && !opts.extraAllowedPorts?.includes(url.port)) return { ok: false, error: "Only standard web ports (80 and 443) are allowed." };

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, error: "URL has no host." };
  const bareHost = host.replace(/^\[|\]$/g, "");
  if (isIP(bareHost)) {
    if (isBlockedAddress(bareHost)) return { ok: false, error: "Links to private, local or reserved network addresses are not allowed." };
  } else {
    if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
      return { ok: false, error: "Links to local or internal hosts are not allowed." };
    }
    if (!host.includes(".")) return { ok: false, error: "Enter a full domain name (for example example.com)." };
    if (!/^[a-z0-9.-]+$/.test(host) || host.split(".").some((label) => label.length === 0 || label.length > 63)) {
      return { ok: false, error: "The domain name is not valid." };
    }
  }
  url.hash = "";
  return { ok: true, url };
}
