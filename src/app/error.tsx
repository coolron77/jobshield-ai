"use client";

import { Button } from "@/components/ui/primitives";

/** Route error boundary: never shows stack traces or internal messages. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-3 text-ink-soft">We couldn&apos;t load this page. Please try again.</p>
      {error.digest ? <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p> : null}
      <Button className="mt-6" onClick={reset}>Try again</Button>
    </main>
  );
}
