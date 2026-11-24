import { describe, expect, it, beforeEach, afterEach } from "vitest";
import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { isBlockedAddress, validatePublicUrl } from "@/lib/url/ssrf";
import { safeFetch, SafeFetchError, type SafeFetchOptions } from "@/lib/url/fetcher";
import { inspectUrl, describeUrl } from "@/lib/url/inspect";
import { htmlToText, extractJobPosting, extractTitle } from "@/lib/url/html";

describe("URL validation", () => {
  const rejected = [
    "ftp://example.com/file",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://localhost/",
    "http://LOCALHOST./admin",
    "http://app.localhost/",
    "http://127.0.0.1/",
    "http://127.1/",
    "http://2130706433/",
    "http://0x7f.0.0.1/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fe80::1]/",
    "http://[fd00::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/",
    "http://172.16.5.4/",
    "http://192.168.1.1/",
    "http://100.64.0.1/",
    "http://metadata.google.internal/",
    "http://printer.local/",
    "http://intranet/",
    "https://example.com:8080/",
    "https://example.com:22/",
    "https://user:pass@example.com/",
  ];
  for (const url of rejected) {
    it(`rejects ${url}`, () => {
      expect(validatePublicUrl(url).ok).toBe(false);
    });
  }
  it("accepts public http(s) URLs and adds https when no scheme is given", () => {
    expect(validatePublicUrl("https://careers.example.com/jobs/1").ok).toBe(true);
    expect(validatePublicUrl("http://example.com:80/").ok).toBe(true);
    const r = validatePublicUrl("example.com/jobs");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.protocol).toBe("https:");
    expect(validatePublicUrl("https://8.8.8.8/").ok).toBe(true);
  });
  it("converts internationalised domains to punycode", () => {
    const r = validatePublicUrl("https://аpple.com/"); // Cyrillic 'а'
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.hostname.startsWith("xn--")).toBe(true);
  });
  it("rejects oversized URLs", () => {
    expect(validatePublicUrl("https://example.com/" + "a".repeat(3000)).ok).toBe(false);
  });
});

describe("IP blocklist", () => {
  it("blocks private, loopback, link-local, CGNAT, multicast and mapped addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.31.255.255", "192.168.0.1", "169.254.169.254", "100.100.100.100", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::abcd", "fc00::1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "2001:db8::1", "::127.0.0.1", "[::1]", "fe80::1%eth0", "not-an-ip"]) {
      expect(isBlockedAddress(ip)).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "142.250.183.14", "2606:4700:4700::1111"]) {
      expect(isBlockedAddress(ip)).toBe(false);
    }
  });
});

describe("safeFetch against a local fixture server", () => {
  let server: http.Server;
  let port = "";
  const routes: Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => void> = {
    "/ok": (_q, r) => {
      r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      r.end("<html><head><title>Intern &amp; Trainee</title><script>alert('x')</script></head><body><h1>Hiring</h1><p>Pay the registration fee.</p></body></html>");
    },
    "/redirect-internal": (_q, r) => {
      r.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      r.end();
    },
    "/redirect-dns-internal": (_q, r) => {
      r.writeHead(302, { location: `http://internal.fixture.test:${port}/ok` });
      r.end();
    },
    "/redirect-ok": (_q, r) => {
      r.writeHead(301, { location: "/ok" });
      r.end();
    },
    "/loop": (_q, r) => {
      r.writeHead(302, { location: "/loop" });
      r.end();
    },
    "/binary": (_q, r) => {
      r.writeHead(200, { "content-type": "application/octet-stream" });
      r.end(Buffer.alloc(100));
    },
    "/big": (_q, r) => {
      r.writeHead(200, { "content-type": "text/plain" });
      r.end("A".repeat(50_000));
    },
    "/gzip-bomb": (_q, r) => {
      r.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
      r.end(zlib.gzipSync(Buffer.alloc(5_000_000, 65)));
    },
    "/slow": () => {
      /* never responds */
    },
    "/404": (_q, r) => {
      r.writeHead(404, { "content-type": "text/html" });
      r.end("nope");
    },
  };

  beforeEach(async () => {
    server = http.createServer((req, res) => (routes[req.url ?? ""] ?? routes["/404"]!)(req, res));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = String((server.address() as AddressInfo).port);
  });
  afterEach(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // The fixture lives on loopback, so tests opt in to that one address and port.
  const fixture = (): SafeFetchOptions => ({
    extraAllowedPorts: [port],
    resolve: async (host) => (host === "internal.fixture.test" ? [{ address: "10.0.0.5", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]),
    isAddressBlocked: (ip) => ip !== "127.0.0.1" && isBlockedAddress(ip),
    timeoutMs: 1500,
  });
  const url = (path: string) => `http://jobs.fixture.test:${port}${path}`;

  it("blocks a hostname that resolves to loopback under the default policy", async () => {
    const err = await safeFetch(url("/ok"), { extraAllowedPorts: [port], resolve: async () => [{ address: "127.0.0.1", family: 4 }] }).catch((e) => e);
    expect(err instanceof SafeFetchError).toBe(true);
    expect((err as SafeFetchError).code).toBe("blocked_address");
  });

  it("blocks when any resolved address is private (mixed records / rebinding)", async () => {
    const err = await safeFetch(url("/ok"), {
      ...fixture(),
      resolve: async () => [
        { address: "127.0.0.1", family: 4 },
        { address: "192.168.0.10", family: 4 },
      ],
    }).catch((e) => e);
    expect((err as SafeFetchError).code).toBe("blocked_address");
  });

  it("fetches an allowed page", async () => {
    const r = await safeFetch(url("/ok"), fixture());
    expect(r.status).toBe(200);
    expect(r.body).toContain("registration fee");
    expect(r.remoteAddress).toBe("127.0.0.1");
  });

  it("follows safe redirects and records them", async () => {
    const r = await safeFetch(url("/redirect-ok"), fixture());
    expect(r.redirects).toHaveLength(1);
    expect(r.finalUrl.endsWith("/ok")).toBe(true);
  });

  it("re-validates redirect targets (IP literal metadata endpoint)", async () => {
    const err = await safeFetch(url("/redirect-internal"), fixture()).catch((e) => e);
    expect((err as SafeFetchError).code).toBe("blocked_address");
  });

  it("re-validates redirect targets (hostname resolving to a private IP)", async () => {
    const err = await safeFetch(url("/redirect-dns-internal"), fixture()).catch((e) => e);
    expect((err as SafeFetchError).code).toBe("blocked_address");
  });

  it("stops redirect loops", async () => {
    const err = await safeFetch(url("/loop"), fixture()).catch((e) => e);
    expect((err as SafeFetchError).code).toBe("too_many_redirects");
  });

  it("rejects unsafe content types", async () => {
    const err = await safeFetch(url("/binary"), fixture()).catch((e) => e);
    expect((err as SafeFetchError).code).toBe("unsupported_content_type");
  });

  it("enforces the size limit", async () => {
    const r = await safeFetch(url("/big"), { ...fixture(), maxBytes: 1000 });
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBe(1000);
  });

  it("enforces the size limit after decompression (gzip bomb)", async () => {
    const r = await safeFetch(url("/gzip-bomb"), { ...fixture(), maxBytes: 10_000 });
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBe(10_000);
  });

  it("times out slow servers", async () => {
    const started = Date.now();
    const err = await safeFetch(url("/slow"), { ...fixture(), timeoutMs: 300 }).catch((e) => e);
    expect((err as SafeFetchError).code).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("reports HTTP errors with status", async () => {
    const err = await safeFetch(url("/404"), fixture()).catch((e) => e);
    expect((err as SafeFetchError).code).toBe("http_error");
    expect((err as SafeFetchError).details.status).toBe(404);
  });

  it("inspectUrl extracts text without scripts and runs rules on page content", async () => {
    const r = await inspectUrl(url("/ok"), fixture());
    expect(r.summary.fetched).toBe(true);
    expect(r.title).toBe("Intern & Trainee");
    expect(r.pageText).not.toContain("alert");
    expect(r.findings.some((f) => f.category === "payment")).toBe(true);
  });

  it("inspectUrl degrades gracefully when inspection is refused", async () => {
    const r = await inspectUrl("http://127.0.0.1/admin");
    expect(r.summary.fetched).toBe(false);
    expect(r.summary.error).toMatch(/private|local|reserved/i);
  });
});

describe("URL notes and HTML extraction", () => {
  it("describes shorteners, messaging links, hosting platforms and cross-domain redirects", () => {
    expect(describeUrl("https://bit.ly/abc", "https://jobs.example.org/x").join(" ")).toMatch(/shortened link; it leads to jobs.example.org/);
    expect(describeUrl("https://wa.me/123", null).join(" ")).toMatch(/messaging chat/);
    expect(describeUrl("https://forms.gle/xyz", null).join(" ")).toMatch(/general-purpose platform/);
    expect(describeUrl("http://jobs.example.com/", null).join(" ")).toMatch(/HTTPS/);
    expect(describeUrl("https://www.linkedin.com/jobs/view/1", null).join(" ")).toMatch(/widely used job platform/);
  });
  it("strips markup and decodes entities", () => {
    expect(htmlToText("<p>A &amp; B</p><style>x{}</style><li>one</li><!-- c -->&#8377;5")).toBe("A & B\n\n• one\n₹5");
    expect(extractTitle("<title> Hi &lt;3 </title>")).toBe("Hi <3");
  });
  it("extracts schema.org JobPosting data", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Analyst",
      hiringOrganization: { "@type": "Organization", name: "Northwind", sameAs: "https://northwind.example" },
      description: "<p>Do analysis.</p>",
      baseSalary: { currency: "INR", value: { minValue: 30000, maxValue: 40000, unitText: "MONTH" } },
    })}</script>`;
    const jp = extractJobPosting(html);
    expect(jp?.hiringOrganization).toBe("Northwind");
    expect(jp?.organizationUrl).toBe("https://northwind.example");
    expect(jp?.description).toBe("Do analysis.");
    expect(jp?.salary).toBe("INR 30000 – 40000 MONTH");
  });
});
