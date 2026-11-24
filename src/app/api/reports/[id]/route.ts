import { deleteReport } from "@/server/handlers/community";
import { withContext } from "@/server/next-context";

export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withContext((ctx) => deleteReport(req, ctx, id));
}
