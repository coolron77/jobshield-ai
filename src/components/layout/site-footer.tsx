import Link from "next/link";
import { Disclaimer } from "@/components/ui/primitives";

export function SiteFooter() {
  return (
    <footer data-site-footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <p className="font-semibold text-ink">JobShield AI</p>
          <p className="mt-1 text-sm text-muted">Don&apos;t get trapped. Verify before you apply.</p>
          <Disclaimer className="mt-4 max-w-md" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Product</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
            <li><Link href="/scan" className="hover:text-ink">Scan a job</Link></li>
            <li><Link href="/demo" className="hover:text-ink">Quick check (no account)</Link></li>
            <li><Link href="/community" className="hover:text-ink">Community reports</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">If you were scammed</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
            <li>Contact your bank immediately.</li>
            <li>
              India: report at{" "}
              <a className="underline hover:text-ink" href="https://cybercrime.gov.in" rel="noopener noreferrer" target="_blank">cybercrime.gov.in</a> or call 1930.
            </li>
            <li>
              US: <a className="underline hover:text-ink" href="https://reportfraud.ftc.gov" rel="noopener noreferrer" target="_blank">reportfraud.ftc.gov</a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
