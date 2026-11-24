import { ButtonLink } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-3xl font-bold">Page not found</h1>
      <p className="mt-3 text-ink-soft">The page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <div className="mt-6 flex justify-center gap-2">
        <ButtonLink href="/">Home</ButtonLink>
        <ButtonLink href="/dashboard" variant="outline">Dashboard</ButtonLink>
      </div>
    </main>
  );
}
