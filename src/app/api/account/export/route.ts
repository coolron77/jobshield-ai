import { exportData } from "@/server/handlers/account";
import { withContext } from "@/server/next-context";

export const runtime = "nodejs";

export function GET(req: Request) {
  return withContext((ctx) => exportData(req, ctx));
}
