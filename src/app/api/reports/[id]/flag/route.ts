import { flagReport } from "@/server/handlers/community";
import { withContext } from "@/server/next-context";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withContext((ctx) => flagReport(req, ctx, id));
}
