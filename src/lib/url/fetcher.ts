import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import zlib from "node:zlib";
import type { LookupFunction } from "node:net";
import { isBlockedAddress, validatePublicUrl } from "./ssrf";

/**
 * Safe server-side HTTP GET for user-submitted URLs.
 *
 *  - Re-validates every redirect hop (scheme, host, port) and follows at most
 *    MAX_REDIRECTS manually.
 *  - Resolves DNS through a custom `lookup` that rejects any private/reserved
 *    address; the socket connects only to the validated address.
 *  - Enforces a total time budget, a response-size cap (after decompression)
 *    and an allow-list of content types. Nothing downloaded is ever executed.
 */

export const DEFAULT_LIMITS = {
  timeoutMs: 8000,
  maxBytes: 1_000_000,
  maxRedirects: 5,
};

export const HTML_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];
export const JSON_TYPES = ["application/json", "application/rdap+json"];

export class SafeFetchError extends Error {
  constructor(
    public code:
      | "invalid_url"
      | "blocked_address"
      | "dns_failure"
      | "timeout"
      | "too_many_redirects"
      | "too_large"
      | "unsupported_content_type"
      | "http_error"
      | "network_error",
    message: string,
    public details: { status?: number; redirects?: string[] } = {},
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowedContentTypes?: string[];
  /** Test seam: override the address policy. Production uses isBlockedAddress. */
  isAddressBlocked?: (ip: string) => boolean;
  /** Test seam: allow an extra port (e.g. an ephemeral test-server port). Never set from user input. */
  extraAllowedPorts?: string[];
  /** Test seam: override DNS resolution. */
  resolve?: (hostname: string) => Promise<{ address: string; family: number }[]>;
}

export interface SafeFetchResult {
  requestedUrl: string;
  finalUrl: string;
  redirects: string[];
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
  remoteAddress: string | null;
}

async function defaultResolve(hostname: string): Promise<{ address: string; family: number }[]> {
  return dns.promises.lookup(hostname, { all: true, verbatim: true });
}

function makeLookup(opts: SafeFetchOptions, onResolved: (ip: string) => void): LookupFunction {
  const blocked = opts.isAddressBlocked ?? isBlockedAddress;
  const resolve = opts.resolve ?? defaultResolve;
  return ((hostname: string, options: { all?: boolean; family?: number }, callback: (...args: unknown[]) => void) => {
    resolve(hostname)
      .then((addresses) => {
        if (addresses.length === 0) throw new SafeFetchError("dns_failure", "The domain did not resolve.");
        // Refuse if ANY resolved address is internal (prevents mixed-record tricks).
        if (addresses.some((a) => blocked(a.address))) {
          throw new SafeFetchError("blocked_address", "The link resolves to a private or reserved network address.");
        }
        const usable = options?.family ? addresses.filter((a) => a.family === options.family) : addresses;
        const list = usable.length ? usable : addresses;
        onResolved((list[0] as { address: string }).address);
        if (options?.all) callback(null, list);
        else callback(null, (list[0] as { address: string }).address, (list[0] as { family: number }).family);
      })
      .catch((err: unknown) => {
        if (err instanceof SafeFetchError) callback(err);
        else callback(new SafeFetchError("dns_failure", "The domain could not be resolved."));
      });
  }) as unknown as LookupFunction;
}

function contentTypeAllowed(ct: string, allowed: string[]): boolean {
  const base = ct.split(";")[0]?.trim().toLowerCase() ?? "";
  return allowed.includes(base);
}

function charsetOf(ct: string): BufferEncoding {
  const m = /charset=([^;]+)/i.exec(ct);
  const cs = m?.[1]?.trim().toLowerCase().replace(/["']/g, "");
  if (cs === "iso-8859-1" || cs === "latin1" || cs === "windows-1252") return "latin1";
  return "utf8";
}

interface HopResult {
  status: number;
  location: string | null;
  contentType: string;
  body: string;
  truncated: boolean;
  remoteAddress: string | null;
}

function requestOnce(url: URL, opts: Required<Pick<SafeFetchOptions, "maxBytes" | "allowedContentTypes">> & SafeFetchOptions, deadline: number): Promise<HopResult> {
  return new Promise((resolvePromise, reject) => {
    let remoteAddress: string | null = null;
    const lib = url.protocol === "https:" ? https : http;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new SafeFetchError("timeout", "The site took too long to respond."));

    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: makeLookup(opts, (ip) => (remoteAddress = ip)),
        headers: {
          "User-Agent": "JobShieldAI-LinkInspector/1.0 (+safety screening; no scripts executed)",
          Accept: [...opts.allowedContentTypes, "*/*;q=0.1"].join(", "),
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en",
        },
        timeout: remaining,
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          res.resume();
          return resolvePromise({ status, location: res.headers.location ?? null, contentType, body: "", truncated: false, remoteAddress });
        }
        if (status >= 400) {
          res.resume();
          return resolvePromise({ status, location: null, contentType, body: "", truncated: false, remoteAddress });
        }
        if (!contentTypeAllowed(contentType, opts.allowedContentTypes)) {
          res.destroy();
          return reject(new SafeFetchError("unsupported_content_type", `Unsupported content type (${contentType.split(";")[0] || "unknown"}). Only web pages can be inspected.`));
        }
        const declared = Number(res.headers["content-length"] ?? "0");
        if (declared > opts.maxBytes * 5) {
          res.destroy();
          return reject(new SafeFetchError("too_large", "The page is too large to inspect."));
        }

        const encoding = String(res.headers["content-encoding"] ?? "identity").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (encoding === "gzip" || encoding === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (encoding === "deflate") stream = res.pipe(zlib.createInflate());
        else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress());
        else if (encoding !== "identity") {
          res.destroy();
          return reject(new SafeFetchError("unsupported_content_type", "Unsupported content encoding."));
        }

        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          resolvePromise({ status, location: null, contentType, body: Buffer.concat(chunks).toString(charsetOf(contentType)), truncated, remoteAddress });
        };
        stream.on("data", (chunk: Buffer) => {
          if (finished) return;
          const room = opts.maxBytes - size;
          if (chunk.length >= room) {
            chunks.push(chunk.subarray(0, room));
            size = opts.maxBytes;
            truncated = true;
            finish();
            res.destroy();
            return;
          }
          chunks.push(chunk);
          size += chunk.length;
        });
        stream.on("end", finish);
        stream.on("error", () => {
          if (!finished) reject(new SafeFetchError("network_error", "The response could not be read."));
        });
      },
    );
    req.on("timeout", () => req.destroy(new SafeFetchError("timeout", "The site took too long to respond.")));
    req.on("error", (err) => {
      if (err instanceof SafeFetchError) reject(err);
      else reject(new SafeFetchError("network_error", "The site could not be reached."));
    });
    req.end();
  });
}

export async function safeFetch(input: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const opts = {
    ...options,
    timeoutMs: options.timeoutMs ?? DEFAULT_LIMITS.timeoutMs,
    maxBytes: options.maxBytes ?? DEFAULT_LIMITS.maxBytes,
    maxRedirects: options.maxRedirects ?? DEFAULT_LIMITS.maxRedirects,
    allowedContentTypes: options.allowedContentTypes ?? HTML_TYPES,
  };
  const deadline = Date.now() + opts.timeoutMs;
  const first = validatePublicUrl(input, { extraAllowedPorts: opts.extraAllowedPorts });
  if (!first.ok) throw new SafeFetchError("invalid_url", first.error);

  let current = first.url;
  const redirects: string[] = [];
  try {
    return await followRedirects();
  } catch (err) {
    if (err instanceof SafeFetchError) err.details.redirects = [...redirects];
    throw err;
  }

  async function followRedirects(): Promise<SafeFetchResult> {
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    const res = await requestOnce(current, opts, deadline);
    if (res.location !== null && res.status >= 300 && res.status < 400) {
      if (hop === opts.maxRedirects) throw new SafeFetchError("too_many_redirects", "The link redirects too many times.");
      let next: URL;
      try {
        next = new URL(res.location, current);
      } catch {
        throw new SafeFetchError("invalid_url", "The site redirected to an invalid address.");
      }
      const check = validatePublicUrl(next.toString(), { extraAllowedPorts: opts.extraAllowedPorts });
      if (!check.ok) throw new SafeFetchError("blocked_address", `The link redirects to a disallowed address: ${check.error}`);
      redirects.push(check.url.toString());
      current = check.url;
      continue;
    }
    if (res.status >= 400) {
      throw new SafeFetchError("http_error", `The site responded with HTTP ${res.status}.`, { status: res.status });
    }
    return {
      requestedUrl: (first as { url: URL }).url.toString(),
      finalUrl: current.toString(),
      redirects,
      status: res.status,
      contentType: res.contentType,
      body: res.body,
      truncated: res.truncated,
      remoteAddress: res.remoteAddress,
    };
  }
  throw new SafeFetchError("too_many_redirects", "The link redirects too many times.");
  }
}
