import { describe, expect, it } from "vitest";
import { checkCompany, type CompanyCheckDeps } from "@/lib/company/check";
import { parseRdap, lookupDomainRegistration, resetRdapCacheForTests } from "@/lib/company/rdap";
import { getRegistrableDomain, editDistance, companyTokens } from "@/lib/url/domain";
import type { UrlInspection } from "@/lib/url/inspect";

const NOW = new Date("2026-11-24T12:00:00Z");

function inspection(overrides: Partial<UrlInspection["summary"]> = {}, pageText = "Northwind Analytics builds data tools."): UrlInspection {
  return {
    summary: {
      submitted_url: "https://northwind.example/",
      final_url: "https://www.northwind.example/",
      domain: "www.northwind.example",
      redirects: [],
      status: 200,
      fetched: true,
      error: null,
      notes: [],
      retrieved_at: NOW.toISOString(),
      ...overrides,
    },
    title: "Northwind Analytics",
    description: null,
    contentType: "text/html",
    truncated: false,
    pageText,
    jobPosting: null,
    findings: [],
  };
}

const deps = (over: Partial<CompanyCheckDeps> = {}): CompanyCheckDeps => ({
  resolveDns: async () => ["93.184.216.34"],
  rdap: async (domain) => ({ domain, source: `https://rdap.example/domain/${domain}`, registrationDate: "2015-03-01T00:00:00Z", expirationDate: null, lastChanged: null, registrar: "Example Registrar", status: [] }),
  inspect: async () => inspection(),
  now: () => NOW,
  ...over,
});

describe("company verification", () => {
  it("separates user claims from checked facts and always lists what was not checked", async () => {
    const r = await checkCompany({ company_name: "Northwind Analytics", website: "https://northwind.example", recruiter_email: "campus@northwind.example" }, deps());
    expect(r.claims.map((c) => c.label)).toContain("Company name");
    expect(r.checked.some((c) => c.label === "Website responded" && c.source.includes("JobShield"))).toBe(true);
    expect(r.checked.some((c) => c.label === "Recruiter domain matches website domain")).toBe(true);
    expect(r.checked.every((c) => c.checked_at && c.source)).toBe(true);
    expect(r.not_checked.map((n) => n.label)).toContain("Legal company registration");
    // Never asserts legitimacy
    const all = JSON.stringify(r).toLowerCase();
    expect(all.includes("is legitimate")).toBe(false);
    expect(all.includes("is registered with")).toBe(false);
  });

  it("warns about free webmail recruiters", async () => {
    const r = await checkCompany({ company_name: "Northwind Analytics", recruiter_email: "northwind.hr@gmail.com" }, deps());
    expect(r.observations.some((o) => o.severity === "warning" && o.message.includes("gmail.com"))).toBe(true);
  });

  it("detects look-alike recruiter domains", async () => {
    const r = await checkCompany({ company_name: "Northwind Analytics", website: "https://northwind.example", recruiter_email: "hr@northwlnd.example" }, deps());
    expect(r.observations.some((o) => o.message.includes("looks similar to"))).toBe(true);
  });

  it("flags very recently registered domains", async () => {
    const r = await checkCompany(
      { company_name: "Northwind Analytics", website: "https://northwind.example" },
      deps({ rdap: async (domain) => ({ domain, source: "rdap", registrationDate: "2026-11-01T00:00:00Z", expirationDate: null, lastChanged: null, registrar: null, status: [] }) }),
    );
    expect(r.observations.some((o) => o.message.includes("registered only 23 day"))).toBe(true);
  });

  it("reports unreachable websites without inventing anything", async () => {
    const r = await checkCompany(
      { company_name: "Northwind Analytics", website: "https://northwind.example" },
      deps({ inspect: async () => inspection({ fetched: false, error: "The site could not be reached.", status: null }) }),
    );
    expect(r.checked.find((c) => c.label === "Website responded")?.value).toMatch(/^No/);
  });

  it("refuses internal website addresses", async () => {
    let inspected = false;
    const r = await checkCompany({ company_name: "Acme", website: "http://192.168.0.1/" }, deps({ inspect: async () => ((inspected = true), inspection()) }));
    expect(inspected).toBe(false);
    expect(r.observations.some((o) => o.message.includes("could not be checked"))).toBe(true);
  });

  it("survives RDAP failures", async () => {
    const r = await checkCompany({ company_name: "Northwind", website: "https://northwind.example" }, deps({ rdap: async () => Promise.reject(new Error("timeout")) }));
    expect(r.checked.some((c) => c.value === "Lookup failed or timed out")).toBe(true);
  });
});

describe("RDAP", () => {
  it("parses registration events and registrar", () => {
    const body = JSON.stringify({
      events: [
        { eventAction: "registration", eventDate: "2010-01-02T00:00:00Z" },
        { eventAction: "expiration", eventDate: "2030-01-02T00:00:00Z" },
      ],
      entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "Registrar Inc."]]] }],
      status: ["active"],
    });
    const r = parseRdap("example.com", "https://rdap/x", body);
    expect(r.registrationDate).toBe("2010-01-02T00:00:00Z");
    expect(r.registrar).toBe("Registrar Inc.");
  });

  it("uses the IANA bootstrap to find the authoritative server", async () => {
    resetRdapCacheForTests();
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      if (url.includes("data.iana.org")) return { body: JSON.stringify({ services: [[["com", "net"], ["https://rdap.verisign.example/com/v1/"]]] }) };
      return { body: JSON.stringify({ events: [{ eventAction: "registration", eventDate: "2001-01-01T00:00:00Z" }] }) };
    };
    const r = await lookupDomainRegistration("example.com", fetcher);
    expect(calls[1]).toBe("https://rdap.verisign.example/com/v1/domain/example.com");
    expect(r?.registrationDate).toBe("2001-01-01T00:00:00Z");
    expect(await lookupDomainRegistration("example.zz", fetcher)).toBeNull();
  });
});

describe("domain helpers", () => {
  it("computes registrable domains for common suffixes", () => {
    expect(getRegistrableDomain("www.careers.infosys.com")).toBe("infosys.com");
    expect(getRegistrableDomain("jobs.tcs.co.in")).toBe("tcs.co.in");
    expect(getRegistrableDomain("www.gov.uk")).toBe("www.gov.uk".replace(/^www\./, ""));
  });
  it("edit distance and tokens", () => {
    expect(editDistance("northwind", "northwlnd")).toBe(1);
    expect(companyTokens("Northwind Analytics Pvt. Ltd.")).toEqual(["northwind", "analytics"]);
  });
});
