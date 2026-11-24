import { expect, test } from "@playwright/test";
import { scanSample, signUp } from "./helpers";

test.describe("scan → report → history → compare", () => {
  test("submit a job description and view the evidence-based report", async ({ page }) => {
    await signUp(page);
    await scanSample(page, "fee-scam");

    await expect(page.getByText("Mock AI (test mode)").first()).toBeVisible();
    await expect(page.getByRole("img", { name: /Warning-sign score \d+ out of 100, Critical risk/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Asks the candidate to pay a fee" })).toBeVisible();
    // Evidence is an exact quote from the ad and is highlighted in the text.
    await expect(page.getByText("“To confirm your seat, pay a refundable registration fee of ₹1,999 within 24 hours.”")).toBeVisible();
    await expect(page.locator("mark").first()).toBeVisible();
    // The mock deliberately fabricates one quote; it must be discarded, not shown.
    await expect(page.getByText("does not appear in the advertisement")).toHaveCount(0);
    await expect(page.getByText(/AI observation\(s\) were discarded/)).toBeVisible();
    await expect(page.getByText("JobShield AI is an advisory screening tool.").first()).toBeVisible();
  });

  test("scan history: list, filter, open and delete", async ({ page }) => {
    await signUp(page);
    await scanSample(page, "fee-scam");
    await scanSample(page, "legit-internship");

    await page.goto("/scans");
    await expect(page.getByTestId("scan-list").getByRole("listitem")).toHaveCount(2);
    await page.getByLabel("Risk level").selectOption("low");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByTestId("scan-list").getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Software Engineering Intern/ })).toBeVisible();

    await page.goto("/scans?q=northwind");
    await expect(page.getByTestId("scan-list").getByRole("listitem")).toHaveCount(1);

    await page.goto("/scans");
    await page.getByRole("button", { name: "Delete scan" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("scan-list").getByRole("listitem")).toHaveCount(1);
  });

  test("compare two opportunities and save the comparison", async ({ page }) => {
    await signUp(page);
    await scanSample(page, "fee-scam");
    await scanSample(page, "legit-internship");

    await page.goto("/compare");
    const options = page.locator("#select-a option:not([disabled])");
    const first = await options.nth(0).getAttribute("value");
    const second = await options.nth(1).getAttribute("value");
    await page.locator("#select-a").selectOption(first!);
    await page.locator("#select-b").selectOption(second!);
    await page.getByTestId("compare-submit").click();

    await expect(page.getByTestId("comparison")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Warning signs by category" })).toBeVisible();
    await page.getByTestId("save-comparison").click();
    await expect(page.getByTestId("save-comparison")).toHaveText(/Saved/);
    await page.goto("/dashboard");
    await expect(page.getByText(/ vs /)).toBeVisible();
  });

  test("users cannot open each other's reports", async ({ browser }) => {
    const a = await browser.newPage();
    await signUp(a);
    const id = await scanSample(a, "task-scam");

    const b = await (await browser.newContext()).newPage();
    await signUp(b);
    const res = await b.goto(`/scans/${id}`);
    expect(res?.status()).toBe(404);
    const api = await b.request.get(`/api/scans/${id}`);
    expect(api.status()).toBe(404);
  });
});
