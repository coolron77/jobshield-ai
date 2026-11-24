import { deleteScan, getScan } from "@/server/handlers/scans";
import { withContext } from "@/server/next-context";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  return withContext((ctx) => getScan(req, ctx, id));
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  return withContext((ctx) => deleteScan(req, ctx, id));
}
