import { demoScan } from "@/server/handlers/tools";
import { publicContext } from "@/server/next-context";

export const runtime = "nodejs";

export function POST(req: Request) {
  return demoScan(req, publicContext());
}
