import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests. Prerequisites (see README → Testing):
 *   supabase start && supabase db reset     # local Supabase with migrations
 *   .env.local pointing at the local Supabase instance
 * AI calls are mocked (JOBSHIELD_MOCK_AI=1) so no API credits are spent.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { JOBSHIELD_MOCK_AI: "1", NEXT_PUBLIC_SITE_URL: baseURL },
  },
});
