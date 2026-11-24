"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { APP_NAV } from "./nav-items";
import { NavIcon } from "./nav-icon";

export function AppSidebar({ isAdmin, email }: { isAdmin: boolean; email: string | null }) {
  const pathname = usePathname();
  const items = APP_NAV.filter((n) => !n.admin || isAdmin);
  return (
    <nav data-app-nav aria-label="App" className="sticky top-20 hidden w-60 shrink-0 self-start md:block">
      <ul className="space-y-0.5">
        {items.map((n) => {
          const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(`${n.href}/`)) || (n.href === "/scans" && pathname.startsWith("/scans/"));
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-brand-50 text-brand-800" : "text-ink-soft hover:bg-white hover:text-ink",
                )}
              >
                <NavIcon name={n.icon} className="h-[18px] w-[18px]" />
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {email ? <p className="mt-6 truncate px-3 text-xs text-muted" title={email}>Signed in as {email}</p> : null}
    </nav>
  );
}
