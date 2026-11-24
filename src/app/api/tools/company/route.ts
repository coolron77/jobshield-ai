import { companyCheck } from "@/server/handlers/tools";
import { withContext } from "@/server/next-context";

export const runtime = "nodejs";
export const maxDuration = 30;

export function POST(req: Request) {
  return withContext((ctx) => companyCheck(req, ctx));
}
