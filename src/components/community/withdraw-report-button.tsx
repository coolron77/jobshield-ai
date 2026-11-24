"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/primitives";

export function WithdrawReportButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title="Withdraw this report?"
      description="It will be permanently deleted, including from the public list if it was published."
      confirmLabel="Withdraw"
      onConfirm={async () => {
        await api(`/api/reports/${id}`, { method: "DELETE" });
        router.refresh();
      }}
      trigger={(open) => (
        <Button variant="ghost" size="sm" onClick={open}>Withdraw</Button>
      )}
    />
  );
}
