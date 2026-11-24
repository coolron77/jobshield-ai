import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/env";
import { getServerEnv } from "@/lib/env";
import { Alert, ButtonLink, Card, CardBody, CardHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Setup required" };

/** Shown when required configuration is missing — no fake data, just instructions. */
export default function SetupPage() {
  const supabase = isSupabaseConfigured();
  const env = getServerEnv();
  const checks = [
    { label: "Supabase URL and publishable key (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)", ok: supabase, required: true },
    { label: "Anthropic API key (ANTHROPIC_API_KEY) — without it scans run in labelled rule-based mode", ok: Boolean(env.anthropicApiKey) || env.mockAi, required: false },
    { label: "Supabase service-role key (SUPABASE_SERVICE_ROLE_KEY) — needed only for full account deletion", ok: Boolean(env.serviceRoleKey), required: false },
  ];
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader as="h1" title="Finish setting up JobShield AI" description="This deployment is missing configuration. Nothing is simulated while it's incomplete." />
        <CardBody className="space-y-4">
          <ul className="space-y-3">
            {checks.map((c) => (
              <li key={c.label} className="flex gap-3 text-sm">
                <span className={`mt-0.5 inline-flex h-5 min-w-12 items-center justify-center rounded px-1.5 text-xs font-bold ${c.ok ? "bg-risk-low-bg text-risk-low" : c.required ? "bg-risk-critical-bg text-risk-critical" : "bg-risk-medium-bg text-risk-medium"}`}>
                  {c.ok ? "OK" : c.required ? "MISSING" : "OPTIONAL"}
                </span>
                <span className="text-ink-soft">{c.label}</span>
              </li>
            ))}
          </ul>
          <Alert tone="info">
            Copy <code>.env.example</code> to <code>.env.local</code>, fill in the values, run the SQL migrations in <code>supabase/migrations</code>, and restart the server. See the README for step-by-step instructions.
          </Alert>
          <div className="flex gap-2">
            <ButtonLink href="/demo" variant="outline">Try the rule-based quick check</ButtonLink>
            <ButtonLink href="/">Home</ButtonLink>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
