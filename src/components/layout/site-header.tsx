import Link from "next/link";
import { getSession } from "@/server/session";
import { ButtonLink } from "@/components/ui/primitives";
import { ShieldIcon } from "@/components/ui/icons";
import { PUBLIC_NAV } from "./nav-items";
import { MobileMenu } from "./mobile-menu";
import { SignOutButton } from "./sign-out-button";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold text-ink" aria-label="JobShield AI home">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
        <ShieldIcon className="h-5 w-5" />
      </span>
      <span className="text-[17px] tracking-tight">
        JobShield <span className="text-brand-600">AI</span>
      </span>
    </Link>
  );
}

export async function SiteHeader() {
  const session = await getSession();
  const signedIn = Boolean(session.user);
  return (
    <header data-site-header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {PUBLIC_NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-brand-50 hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <>
              <ButtonLink href="/dashboard" variant="outline" size="sm">
                Dashboard
              </ButtonLink>
              <SignOutButton />
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Log in
              </ButtonLink>
              <ButtonLink href="/signup" size="sm">
                Sign up free
              </ButtonLink>
            </>
          )}
        </div>
        <MobileMenu signedIn={signedIn} isAdmin={session.role === "admin"} />
      </div>
    </header>
  );
}
