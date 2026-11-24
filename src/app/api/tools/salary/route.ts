import { salaryCheck } from "@/server/handlers/tools";
import { withContext } from "@/server/next-context";

export const runtime = "nodejs";

export function POST(req: Request) {
  return withContext((ctx) => salaryCheck(req, ctx));
}
