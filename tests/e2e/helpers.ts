import { expect, type Page } from "@playwright/test";

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}+${Date.now()}${Math.floor(Math.random() * 1e4)}@jobshield.test`;
}

export const PASSWORD = "Str0ngPassw0rd!";

/** Sign up through the UI. Local Supabase has email confirmation disabled (supabase/config.toml). */
export async function signUp(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Student");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return email;
}

export async function scanSample(page: Page, sampleId: string): Promise<string> {
  await page.goto("/scan");
  await page.getByTestId(`sample-${sampleId}`).click();
  await page.getByTestId("scan-submit").click();
  await expect(page).toHaveURL(/\/scans\/[0-9a-f-]{36}$/, { timeout: 45_000 });
  return page.url().split("/").pop() as string;
}
