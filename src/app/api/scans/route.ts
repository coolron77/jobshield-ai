import { createScan, listScans } from "@/server/handlers/scans";
import { withContext } from "@/server/next-context";

export const runtime = "nodejs";
export const maxDuration = 60;

export function GET(req: Request) {
  return withContext((ctx) => listScans(req, ctx));
}

export function POST(req: Request) {
  return withContext((ctx) => createScan(req, ctx));
}
