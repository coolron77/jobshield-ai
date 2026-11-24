import { expect, test } from "@playwright/test";
import { PASSWORD, signUp, uniqueEmail } from "./helpers";

test("registration, logout and login", async ({ page }) => {
  const email = await signUp(page, uniqueEmail("auth"));
  await expect(page.getByRole("heading", { name: /Hi, E2E Student/ })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL("/");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect email or password");

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("protected pages redirect to login and keep the destination", async ({ page }) => {
  await page.goto("/scans");
  await expect(page).toHaveURL(/\/login\?next=%2Fscans/);
});

test("sign-up validates the form before submitting", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter your email.")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
});

test("API rejects unauthenticated and cross-site requests", async ({ request, baseURL }) => {
  const anon = await request.post("/api/scans", { data: { text: "x".repeat(100) }, headers: { origin: baseURL! } });
  expect(anon.status()).toBe(401);
  const admin = await request.get("/api/admin/stats");
  expect(admin.status()).toBe(401);
});
