import { describe, expect, it } from "vitest";
import { parseSalaryClaims, checkSalary, toMonthly, type SalaryBenchmark } from "@/lib/salary/salary";
import { detectPaymentRequests, classifyFee } from "@/lib/analysis/payment";

describe("salary parsing", () => {
  it("parses currency, ranges, multipliers and periods", () => {
    const c = parseSalaryClaims("Stipend ₹40,000 per month. CTC 6-8 LPA. Earn $500/week. £30k a year.");
    expect(c).toHaveLength(4);
    expect(c[0]).toMatchObject({ currency: "INR", min: 40000, max: 40000, period: "month", monthlyMax: 40000 });
    expect(c[1]).toMatchObject({ currency: "INR", min: 600000, max: 800000, period: "year" });
    expect(c[2]).toMatchObject({ currency: "USD", min: 500, period: "week" });
    expect(c[3]).toMatchObject({ currency: "GBP", min: 30000, period: "year", monthlyMax: 2500 });
  });
  it("normalises periods to monthly", () => {
    expect(toMonthly(1000, "day")).toBe(22000);
    expect(toMonthly(12000, "year")).toBe(1000);
  });
  it("ignores numbers without a currency", () => {
    expect(parseSalaryClaims("We have 250 employees and were founded in 2004.")).toHaveLength(0);
  });
});

const bm: SalaryBenchmark = {
  id: "b1",
  role_keyword: "data entry",
  country: "India",
  currency: "INR",
  experience_level: "fresher",
  period: "month",
  min_amount: 12000,
  max_amount: 22000,
  source_name: "Test Source",
  source_url: "https://example.org/salary",
  retrieved_at: "2026-10-01",
};

describe("salary checker", () => {
  it("refuses to guess when no benchmark exists", () => {
    const r = checkSalary({ text: "Salary ₹90,000 per month", role: "Data entry operator", experience_level: "fresher", country: "Kenya", currency: "KES" }, [bm]);
    expect(r.benchmark.status).toBe("none");
    if (r.benchmark.status === "none") expect(r.benchmark.message).toMatch(/will not guess/);
  });
  it("flags pay far above a matching benchmark", () => {
    const r = checkSalary({ text: "Earn ₹25,000 per week", role: "Data entry operator", experience_level: "fresher", country: "India", currency: "INR" }, [bm]);
    expect(r.benchmark.status).toBe("matched");
    if (r.benchmark.status === "matched") {
      expect(r.benchmark.verdict).toBe("far_above_range");
      expect(r.benchmark.ratio).toBeGreaterThan(4);
    }
    expect(r.warnings.some((w) => w.severity === "high")).toBe(true);
  });
  it("accepts pay within range", () => {
    const r = checkSalary({ text: "", role: "Data entry operator", experience_level: "fresher", country: "India", currency: "INR", amount: 18000, period: "month" }, [bm]);
    if (r.benchmark.status === "matched") expect(r.benchmark.verdict).toBe("within_range");
    else throw new Error("expected benchmark match");
  });
  it("flags guaranteed-earnings wording without any benchmark", () => {
    const r = checkSalary({ text: "Guaranteed income of ₹5,000 daily", role: "Promoter", experience_level: "student", country: "India", currency: "INR" }, []);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("payment scam detector", () => {
  it("classifies fee types", () => {
    expect(classifyFee("pay a refundable security deposit", "payment.named_fee")).toBe("security_deposit");
    expect(classifyFee("training fee of Rs 2000", "payment.named_fee")).toBe("training");
    expect(classifyFee("interview fee", "payment.named_fee")).toBe("interview");
    expect(classifyFee("registration fee", "payment.named_fee")).toBe("registration");
    expect(classifyFee("buy the laptop from our vendor", "payment.buy_equipment")).toBe("equipment");
    expect(classifyFee("top up to unlock", "payment.deposit_to_unlock")).toBe("task_deposit");
  });
  it("reports a payment request with caveats", () => {
    const r = detectPaymentRequests("Selected candidates must pay ₹1500 as a training fee before joining.");
    expect(r.verdict).toBe("payment_requested");
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.caveats.some((c) => c.includes("Not every fee is fraud"))).toBe(true);
  });
  it("reports none when there is no payment wording", () => {
    expect(detectPaymentRequests("We are hiring a junior designer. Apply on our careers page.").verdict).toBe("none_detected");
  });
});
