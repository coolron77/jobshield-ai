import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("mobile navigation opens, navigates and closes", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByTestId("mobile-menu-button");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Try a quick check" }).click();
  await expect(page).toHaveURL(/\/demo/);
  await expect(page.getByRole("navigation", { name: "Mobile" })).toHaveCount(0);
});

test("signed-in mobile menu shows app sections", async ({ page }) => {
  await signUp(page);
  await page.getByTestId("mobile-menu-button").click();
  const nav = page.getByRole("navigation", { name: "Mobile" });
  await expect(nav.getByRole("link", { name: "Scan a job" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(nav).toHaveCount(0);
});

test("rule-based quick check works without an account", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: /Sample: work-from-home|Sample: data-entry/i }).first().click();
  await page.getByRole("button", { name: "Run quick check" }).click();
  await expect(page.getByText("Rule-based only").first()).toBeVisible();
  await expect(page.getByTestId("finding").first()).toBeVisible();
});
