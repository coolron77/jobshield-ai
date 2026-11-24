"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/primitives";
import { TrashIcon } from "@/components/ui/icons";

export function DeleteScanButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title="Delete this scan?"
      description="This permanently deletes the report and any saved comparisons that use it."
      confirmLabel="Delete"
      onConfirm={async () => {
        await api(`/api/scans/${id}`, { method: "DELETE" });
        router.refresh();
      }}
      trigger={(open) => (
        <Button variant="ghost" size="icon" onClick={open} aria-label="Delete scan" title="Delete scan">
          <TrashIcon className="h-[18px] w-[18px]" />
        </Button>
      )}
    />
  );
}
