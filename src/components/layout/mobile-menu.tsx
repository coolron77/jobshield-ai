"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MenuIcon, XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { APP_NAV, PUBLIC_NAV } from "./nav-items";
import { NavIcon } from "./nav-icon";

export function MobileMenu({ signedIn, isAdmin }: { signedIn: boolean; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on navigation (adjust state during render, per React guidance) and on Escape.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const items = signedIn ? APP_NAV.filter((n) => !n.admin || isAdmin) : [];

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-brand-50"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        data-testid="mobile-menu-button"
      >
        {open ? <XIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
      </button>
      {open ? (
        <nav id="mobile-menu" aria-label="Mobile" className="absolute inset-x-0 top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-white px-4 pb-6 pt-2 shadow-lg">
          <ul className="space-y-1">
            {items.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={pathname === n.href ? "page" : undefined}
                  className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium", pathname === n.href ? "bg-brand-50 text-brand-800" : "text-ink-soft hover:bg-canvas")}
                >
                  <NavIcon name={n.icon} className="h-5 w-5" />
                  {n.label}
                </Link>
              </li>
            ))}
            {!signedIn
              ? PUBLIC_NAV.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} className="block rounded-lg px-3 py-2.5 text-[15px] font-medium text-ink-soft hover:bg-canvas">
                      {n.label}
                    </Link>
                  </li>
                ))
              : null}
          </ul>
          <div className="mt-4 border-t border-line pt-4">
            {signedIn ? (
              <form action="/auth/signout" method="post">
                <button type="submit" className="w-full rounded-lg px-3 py-2.5 text-left text-[15px] font-medium text-ink-soft hover:bg-canvas">
                  Sign out
                </button>
              </form>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link href="/login" className="rounded-xl border border-line px-4 py-2.5 text-center font-semibold">
                  Log in
                </Link>
                <Link href="/signup" className="rounded-xl bg-brand-600 px-4 py-2.5 text-center font-semibold text-white">
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
