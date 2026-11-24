import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";

/**
 * Per-request Supabase client bound to the user's auth cookies. All queries
 * made with it run as that user, under Row Level Security.
 * Returns null when Supabase is not configured.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const { supabaseUrl, supabaseKey } = getPublicEnv();
  if (!supabaseUrl || !supabaseKey) return null;
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/** Validates the session with Supabase Auth (not just the cookie). */
export async function getCurrentUser(client: SupabaseClient | null): Promise<User | null> {
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export async function getCurrentRole(client: SupabaseClient, userId: string): Promise<"user" | "admin"> {
  const { data } = await client.from("profiles").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin" ? "admin" : "user";
}
