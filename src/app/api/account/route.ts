import { deleteAccount, updateProfile } from "@/server/handlers/account";
import { withContext } from "@/server/next-context";

export const runtime = "nodejs";

export function PATCH(req: Request) {
  return withContext((ctx) => updateProfile(req, ctx));
}

export function DELETE(req: Request) {
  return withContext((ctx) => deleteAccount(req, ctx));
}
