import { createComparison } from "@/server/handlers/community";
import { withContext } from "@/server/next-context";

export const runtime = "nodejs";

export function POST(req: Request) {
  return withContext((ctx) => createComparison(req, ctx));
}
