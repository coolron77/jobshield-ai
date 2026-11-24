import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getSession } from "@/server/session";

/**
 * Authenticated area. The session is verified here on the server (the proxy
 * redirect, which preserves ?next=, is only a convenience), and every page and
 * API handler re-checks it before touching data.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.configured) redirect("/setup");
  if (!session.user) redirect("/login");
  return (
    <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 sm:px-6 md:py-8">
      <AppSidebar isAdmin={session.role === "admin"} email={session.user.email} />
      <main id="main" className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}
