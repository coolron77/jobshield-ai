import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient, getCurrentRole, getCurrentUser } from "@/lib/supabase/server";
import { buildContext } from "./next-context";
import type { HandlerContext } from "./context";

export interface Session {
  configured: boolean;
  client: SupabaseClient | null;
  user: { id: string; email: string | null } | null;
  role: "user" | "admin";
}

/** Per-request session lookup (deduplicated with React cache). */
export const getSession = cache(async (): Promise<Session> => {
  const client = await createSupabaseServerClient();
  if (!client) return { configured: false, client: null, user: null, role: "user" };
  const user = await getCurrentUser(client);
  if (!user) return { configured: true, client, user: null, role: "user" };
  const role = await getCurrentRole(client, user.id);
  return { configured: true, client, user: { id: user.id, email: user.email ?? null }, role };
});

/** For server components in the authenticated area. */
export async function requirePageContext(nextPath: string): Promise<{ ctx: HandlerContext; session: Session & { client: SupabaseClient; user: NonNullable<Session["user"]> } }> {
  const session = await getSession();
  if (!session.configured || !session.client) redirect("/setup");
  if (!session.user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const s = session as Session & { client: SupabaseClient; user: NonNullable<Session["user"]> };
  return { ctx: buildContext(s.client, s.user), session: s };
}
