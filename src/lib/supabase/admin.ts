import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS — used ONLY to delete a user's auth
 * account after they confirm deletion. Never import this into client code
 * ("server-only" enforces it at build time).
 */
export function getAuthAdmin(): { deleteUser(userId: string): Promise<void> } | null {
  const { supabaseUrl } = getPublicEnv();
  const { serviceRoleKey } = getServerEnv();
  if (!supabaseUrl || !serviceRoleKey) return null;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async deleteUser(userId: string) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(`Auth user deletion failed: ${error.message}`);
    },
  };
}
