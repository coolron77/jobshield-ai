import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/security/http";
import { getPublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** POST-only sign-out (a GET link could be triggered cross-site). */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request, [getPublicEnv().siteUrl])) {
    return NextResponse.json({ error: { code: "forbidden", message: "Cross-site request rejected." } }, { status: 403 });
  }
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
