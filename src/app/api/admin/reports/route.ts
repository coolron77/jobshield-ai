import { moderationQueue } from "@/server/handlers/community";
import { withContext } from "@/server/next-context";

export const runtime = "nodejs";

export function GET(req: Request) {
  return withContext((ctx) => moderationQueue(req, ctx));
}
