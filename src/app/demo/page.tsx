import type { Metadata } from "next";
import { DemoScanner } from "@/components/scan/demo-scanner";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Quick check (no account)" };

export default function DemoPage() {
  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Quick check — no account needed"
        description="Runs JobShield's rule-based checks in real time. It does not use Claude and nothing is saved. Sign up for the full AI analysis, saved reports and comparisons."
      />
      <DemoScanner />
    </main>
  );
}
