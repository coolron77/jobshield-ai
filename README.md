# JobShield AI

**Don't get trapped. Verify before you apply.**

JobShield AI helps students, fresh graduates and job seekers spot warning signs in job and internship ads before they pay money or share sensitive information. Paste an ad (and/or a link) and get a transparent report: a warning-sign score, every finding backed by an exact quote from the ad, positive signals, missing information, and concrete steps to verify the employer.

> JobShield AI is an advisory screening tool. Its findings are not legal determinations or proof of fraud. Always verify opportunities independently.

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Local setup](#local-setup)
4. [Supabase setup](#supabase-setup)
5. [Anthropic setup](#anthropic-setup)
6. [Environment variables](#environment-variables)
7. [Testing](#testing)
8. [Deploying to Vercel](#deploying-to-vercel)
9. [How the analysis works](#how-the-analysis-works)
10. [Security model](#security-model)
11. [Demo flow](#demo-flow)
12. [Limitations](#limitations)

---

## Features

| Area | What it does |
| --- | --- |
| **Job scanner** | Paste an ad and/or a URL. Sensitive numbers are redacted, deterministic rules run, then Claude analyses the text using structured outputs. Every finding must quote the ad verbatim. If a quote can't be found in the text, the finding is discarded and the report says how many were dropped. |
| **Analysis report** | Score (0–100) and level, a "Why this score?" breakdown, findings (severity, confidence, source, explanation, action), the ad with evidence highlighted, positive signals, missing information, verification steps, link inspection, limitations. Copy-as-text and print-friendly layout. |
| **Payment scam detector** | Classifies registration, deposit, training, interview, equipment, processing, task-deposit and untraceable-payment requests, and explains each one with caveats. |
| **Salary checker** | Parses salary claims (₹/$/£/€…, k/lakh/LPA, per hour/day/week/month/year), flags easy-money and guaranteed-income wording, and compares against **admin-curated, cited** benchmarks. If no benchmark exists it says so instead of guessing. No salary data ships with the app. |
| **Job URL checker** | SSRF-hardened server-side fetch: domain, redirect chain (each hop re-validated), status, title, schema.org `JobPosting` data, page-text warning signs, and notes on shorteners, messaging links, general-purpose hosting, punycode and cross-domain redirects. |
| **Company verification** | Splits results into **checked facts** (with source + timestamp: website response, DNS, RDAP domain registration), **user claims**, **observations** (free webmail, domain mismatch, look-alike domains, very new domains) and **not checked** (legal registration, reviews, ownership), with links to official registries. Never asserts legitimacy. |
| **Compare** | Side-by-side comparison of two scans by score, category counts, missing information, positive signals and top findings. Comparisons can be saved. |
| **Community reports** | Authenticated users submit reports. They start `pending` and are visible only to the reporter and admins. Admins approve, reject or remove them through an audited RPC. The public sees approved reports only, with no reporter identity. Any user can flag a report, and three flags hide it again for re-review. |
| **History** | Search, filter by level, paginate, open and delete scans. |
| **Settings** | Display name, privacy toggle (don't store ad text), password change, JSON data export, delete all data, delete account. |
| **Admin dashboard** | Aggregate counts only (no scan contents), moderation queue with status filters, moderation log. Authorised server-side from the database role; non-admins get a 404. |
| **Quick check (no account)** | Public, rate-limited, rules-only analysis that is clearly labelled and never stored. |

## Architecture

```
Next.js 16 App Router (TypeScript, React 19, Tailwind CSS v4)
├── src/proxy.ts                  Session refresh + redirect for protected pages (Next 16 "proxy")
├── src/app/                      Pages (server components) + thin API route wrappers
│   ├── (app)/…                   Authenticated area (layout re-checks the session)
│   ├── (auth)/…                  Login, sign-up, password recovery
│   └── api/…/route.ts            One-liners that call framework-agnostic handlers
├── src/server/
│   ├── handlers/*.ts             Auth, CSRF, body limits, rate limits, validation, logic
│   ├── context.ts                Dependency-injected HandlerContext (repos, analyzer, …)
│   └── next-context.ts           Builds the context from the user's Supabase session
├── src/lib/
│   ├── analysis/                 redact → rules → Claude (ai.ts) → evidence → scoring → pipeline
│   │   └── anthropic-client.ts   The only module that imports the Anthropic SDK (server-only)
│   ├── url/                      ssrf.ts, fetcher.ts, html.ts, inspect.ts, domain.ts
│   ├── company/                  check.ts, rdap.ts
│   ├── salary/salary.ts
│   └── db/                       Repository interfaces + Supabase implementations
└── supabase/
    ├── migrations/               Schema, RLS, RPCs (moderation, rate limit, admin stats)
    └── tests/rls_test.sql        67 isolation/authorisation assertions
```

Handlers use standard `Request`/`Response` and receive their dependencies through `HandlerContext`, so the same code runs in Next.js routes and in unit tests with in-memory repositories that mirror the RLS rules.

**Data flow for a scan:** `POST /api/scans` → session check → same-origin check → 64 KB body limit → Zod validation → DB rate limit (10 per 10 min, 60 per day) → optional safe URL fetch → redaction → rules → Claude (structured JSON output, Zod-validated, retry once) → quote verification → scoring → insert under RLS → redirect to `/scans/:id`.

## Local setup

Requirements: Node.js ≥ 20.9 (22 recommended), npm, and either the [Supabase CLI](https://supabase.com/docs/guides/local-development) with Docker or a hosted Supabase project.

```bash
npm install                      # creates package-lock.json — commit it
cp .env.example .env.local       # then fill in values (see below)

# Option A: local Supabase
supabase start                   # prints the local API URL and keys
supabase db reset                # applies supabase/migrations/*

npm run dev                      # http://localhost:3000
```

Without Supabase variables the app shows a `/setup` page listing what's missing. The landing page and the rules-only quick check still work. Nothing is simulated.

## Supabase setup

1. **Create a project** at supabase.com. Copy **Project URL** and the **publishable key** (or legacy anon key) into `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. **Run the migrations** in order: `supabase link --project-ref <ref> && supabase db push`, or paste each file from `supabase/migrations/` into the SQL editor.
3. **Auth → URL configuration:** set *Site URL* to your deployment URL and add `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback` for development) to *Redirect URLs*.
4. **Auth → Providers → Email:** keep *Confirm email* **on** in production.
5. **Optional (account deletion):** copy the **service-role** key into `SUPABASE_SERVICE_ROLE_KEY` (server-only). Without it, users can still delete all of their data, and the "Delete account" button explains why it's unavailable.
6. **Make yourself an admin.** Roles can't be set from the app. In the SQL editor:
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
7. **Optional salary benchmarks.** Insert cited rows as an admin (via SQL), for example:
   ```sql
   insert into public.salary_benchmarks (role_keyword, country, currency, experience_level, period, min_amount, max_amount, source_name, source_url, retrieved_at)
   values ('data entry', 'India', 'INR', 'fresher', 'month', <min>, <max>, '<source name>', 'https://<source>', '<YYYY-MM-DD>');
   ```
   Use only figures from a source you can cite.
8. **Optional housekeeping:** schedule `select public.purge_rate_limits();` daily with `pg_cron`.

### Database objects

| Object | Purpose / protection |
| --- | --- |
| `profiles` | One row per user, created by trigger. Users can update only `display_name` and `store_scan_text` (column grants). `role` is never read from sign-up metadata. |
| `scans` | Owner-only select/insert/delete. Immutable (no UPDATE). Size limits, a SHA-256 of the analysed text, and a CHECK that `risk_level` matches the score band. |
| `saved_comparisons` | Owner-only. The insert policy requires both scans to belong to the caller. |
| `community_reports` | Insert only with content columns. Status, reporter and counters come from defaults. Readable by the reporter and admins only. |
| `public_community_reports` (view) | Approved reports only, without `reporter_id`, `scan_id` or flag counts. Readable by `anon`. |
| `report_flags` | One flag per user per report. Only for public reports, and never on your own. A trigger hides a report after 3 flags. |
| `moderation_actions` | Audit log. Admin read-only. Written only by `moderate_report()` and the flag trigger. |
| `salary_benchmarks` | Readable by authenticated users. Writes are admin-only. |
| `private.rate_limits` | Not exposed through the API. Accessed only via `check_rate_limit()`. |
| `is_admin()`, `moderate_report()`, `check_rate_limit()`, `admin_stats()` | `SECURITY DEFINER` with `search_path=''`. Each re-checks the caller itself. |

## Anthropic setup

1. Create an API key at console.anthropic.com and set `ANTHROPIC_API_KEY` (server-only, never `NEXT_PUBLIC_`).
2. `ANTHROPIC_MODEL` defaults to `claude-sonnet-5-5`. `ANTHROPIC_EFFORT` (`low|medium|high`, default `medium`) and `ANTHROPIC_MAX_OUTPUT_TOKENS` (default 4000, clamped to 1000–16000) are optional.
3. The request uses **structured outputs** (`output_config.format` with a strict JSON schema). It does not use forced `tool_choice` or non-default `temperature`, which current models reject. The SDK retries transient errors twice. JobShield retries once on invalid output, doubles `max_tokens` after truncation, and never retries refusals.
4. Without a key, scans run in **rule-based mode** and are labelled as such in the UI, the stored report and the admin statistics.

## Environment variables

| Variable | Required | Exposure | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | recommended | public | Used for CSRF origin allow-list and CSP |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | public | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | public | `NEXT_PUBLIC_SUPABASE_ANON_KEY` also accepted |
| `SUPABASE_SERVICE_ROLE_KEY` | no | **server only** | Only for deleting auth accounts |
| `ANTHROPIC_API_KEY` | for AI | **server only** | |
| `ANTHROPIC_MODEL` / `ANTHROPIC_EFFORT` / `ANTHROPIC_MAX_OUTPUT_TOKENS` | no | server | |
| `JOBSHIELD_MOCK_AI` | tests only | server | `1` = deterministic mock analyzer, labelled "Mock AI (test mode)". Throws if `VERCEL_ENV=production`. |

Never commit `.env*` files (they're git-ignored except `.env.example`).

## Testing

```bash
npm test               # Vitest unit + handler tests (no network, no credits)
npm run test:rls       # migrations + RLS isolation tests (see below)
npm run test:e2e       # Playwright (needs local Supabase; AI is mocked)
npm run typecheck && npm run lint && npm run build
```

**Unit and handler tests (`tests/unit`, 153 tests)** cover:
- risk scoring, bands, floors, caps and duplicate-signal handling
- AI schema validation, malformed and truncated responses, retries, refusals, and error mapping that never leaks details
- evidence-quote matching and fabricated-quote rejection
- payment, salary and suspicious-language detection, and redaction
- URL validation and SSRF: private, loopback, IPv6-mapped, decimal and hex IPs, metadata endpoints, redirect re-validation, DNS rebinding with mixed records, size and gzip-bomb limits, timeouts, content types. These run against a real local HTTP server.
- company and RDAP checks
- authentication (401 on every protected handler), CSRF, 413/415/400 handling, rate limiting (429)
- scan create, list, filter, delete and IDOR isolation
- comparisons, community reports, flags and moderation authorisation
- data export and deletion, the open-redirect guard, and env safety

**RLS tests (`supabase/tests/rls_test.sql`, 67 assertions)** act as the `anon` and `authenticated` roles with different JWT subjects. They check owner isolation, IDOR, role-escalation attempts, column privileges, moderation authorisation, the public view's columns, flag rules and auto-hide, rate-limiter isolation and tamper resistance, admin-only statistics, and delete cascades. Ways to run them:
- `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:rls` against local Supabase
- `PG_URL=postgresql://… npm run test:rls` against any throwaway Postgres ≥ 15; it uses `supabase/tests/00_supabase_stub.sql` to emulate `auth.uid()` and the Supabase roles

**E2E (`tests/e2e`)** covers registration and login, protected redirects, form validation, submitting a job description, viewing the report (exact quotes, highlights, discarded fabricated evidence), history filter and delete, comparing and saving, cross-user isolation, mobile navigation, and the public quick check. The suite builds the app and starts it with `JOBSHIELD_MOCK_AI=1`.

## Deploying to Vercel

1. Push the repository to GitHub, including `package-lock.json`.
2. In Vercel, choose **Add New → Project** and import the repo. The framework is detected as Next.js.
3. Add the environment variables above under **Settings → Environment Variables** (Production and Preview). Do **not** set `JOBSHIELD_MOCK_AI`.
4. Deploy. Then set Supabase **Site URL** and **Redirect URLs** to `https://<your-vercel-domain>/auth/callback` and set `NEXT_PUBLIC_SITE_URL` to the same origin. Redeploy.
5. Smoke test: sign up, confirm the email, scan a sample ad, and check that the report shows **"Claude AI + rules"**.

Function limits: `/api/scans` sets `maxDuration = 60`, and the URL and company tools set 30. All routes run on the Node.js runtime because the safe fetcher uses `node:http` with a custom DNS lookup.

## How the analysis works

1. **Redaction.** Card numbers (Luhn-checked), bank account numbers, IBAN, IFSC, UPI IDs, Aadhaar, PAN, SSN, passwords, OTPs and phone numbers are replaced with labelled placeholders **before** anything is stored or sent to Claude.
2. **Rules.** About 20 documented detectors, each with a severity, a fixed confidence and a *signal key*. Examples: named fees, "pay ₹X", deposits to unlock tasks, gift cards and crypto, guaranteed income, per-day earning pitches, guaranteed selection, chat-only interviews, money-mule patterns, credential requests, ID and bank document requests, free webmail, messaging apps, urgency, and AI-instruction injection.
3. **Claude.** The ad and page text are wrapped in tags whose names carry a random nonce. Lookalike tags inside the content are neutralised. The system prompt treats tagged content as untrusted data, forbids following embedded instructions, and forbids claims of external verification.
4. **Evidence verification.** Each AI quote is located in the analysed text, tolerating whitespace, case and typographic differences, and replaced by the exact original substring. Quotes that can't be located are discarded and counted.
5. **Scoring** (`src/lib/analysis/scoring.ts`):
   - Points = severity weight (critical 40, high 25, medium 12, low 5) × confidence.
   - The same behaviour counts once: rules merge by signal key, and AI findings merge into the overlapping same-category finding.
   - Diminishing returns apply within a category (×0.5 for each additional finding).
   - Missing information is capped at 10 points.
   - Floors: a confident critical finding sets a minimum of 60, a confident high finding a minimum of 30.
   - Bands: 0–24 Low, 25–49 Medium, 50–74 High, 75–100 Critical.
   - **The score counts warning signs. It is not a probability of fraud.**

## Security model

- Secrets are read only in server modules. `anthropic-client.ts` and `supabase/admin.ts` import `server-only`, so importing them from client code fails the build.
- **AuthN/AuthZ.** `proxy.ts` refreshes sessions and redirects signed-out visitors. The `(app)` layout re-checks the session on the server, and every handler requires a user. Admin access comes from `profiles.role` in the database, never from client input or hidden links. Database functions re-check `is_admin()`.
- **RLS everywhere.** API data access uses the user's own session, never the service role. Handlers also filter by owner, as defence in depth.
- **CSRF.** All state-changing routes require a same-origin `Origin`/`Referer`. Sign-out is POST-only. Auth cookies are `SameSite=Lax`.
- **Input.** Zod on every endpoint, byte-limited body reading (checks both the declared and the streamed size), control-character stripping, and UUID checks on route params.
- **Abuse.** DB-backed per-user rate limits on AI and fetch routes. The public demo uses a per-IP limiter and makes no AI calls.
- **XSS.** Submitted text is rendered only as React text nodes. There is no `dangerouslySetInnerHTML`, and ESLint enforces `react/no-danger`. The CSP sets `object-src 'none'` and `frame-ancestors 'none'`.
- **SSRF.** Only http/https on ports 80/443. No credentials in URLs, no internal hostnames, and IPv4/IPv6 special ranges are blocked. Every resolved address is checked inside the socket's DNS `lookup`, which defeats rebinding, and a single private record rejects the request. Redirects are followed manually (max 5) and each one is re-validated. Content types are allow-listed. There's an 8 s budget and a 1 MB cap applied after decompression. Nothing downloaded is executed.
- **Errors.** Handlers return generic messages with a request ID. Details go only to server logs, without request bodies.
- **Privacy.** Users can stop storing ad text, export their data, and delete their data or account. Community reports never expose the reporter, and the excerpt is capped at 1,500 characters.
- **Headers.** CSP, HSTS (production), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy` are set in `next.config.ts`.

## Demo flow

1. Open `/` and select **Quick check without an account**. Pick a sample to see rule-based results instantly.
2. **Sign up** and go to **Scan a job**. Select *data-entry job with a 'registration fee'* and **Analyse**.
3. Walk through the report: score and breakdown, findings with exact quotes, highlighted ad, verification steps, limitations.
4. Scan *detailed software internship*, then open **Compare** to see the two side by side, and save the comparison.
5. **Payment check** and **Salary check**: paste "Earn ₹5,000 daily, guaranteed. Pay ₹999 training fee." in each.
6. **Link checker**: try `https://bit.ly/…` or a job-board URL.
7. **Company check**: enter a company name, its website, and a `@gmail.com` recruiter address.
8. From a report, choose **Report to community**. As an admin, approve it in **Admin**, then view it publicly in **Community reports**.

All sample ads are fictional and labelled. Their `example.*` domains are reserved (RFC 2606).

## Limitations

- The score reflects detected wording-level warning signs. Sophisticated scams can use clean-looking ads, and legitimate ads can trigger rules. Users are told to verify independently.
- No company-registry API is integrated. Legal registration is explicitly marked **not checked**, with links to official registries. RDAP shows domain dates, not who owns a domain or whether a company is legitimate.
- No salary benchmarks ship with the app. Without admin-curated, cited benchmarks, the salary checker relies on wording checks only and says so.
- The URL checker reads static HTML only. Pages that need JavaScript, logins or bot checks (e.g. some job portals) may return little text. The user is told and can paste the text instead.
- Redaction is pattern-based and may miss unusual formats. Users are warned not to paste their own sensitive data.
- The public demo's per-IP limiter is per server instance. AI routes use the shared database limiter.
- `getRegistrableDomain` approximates the Public Suffix List for common suffixes only.
