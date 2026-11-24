"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CheckIcon, TrashIcon } from "@/components/ui/icons";

export function SaveComparisonButton({ a, b, saved }: { a: string; b: string; saved: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">(saved ? "saved" : "idle");
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setState("busy");
    setMessage(null);
    try {
      await api("/api/comparisons", { body: { scan_a_id: a, scan_b_id: b } });
      setState("saved");
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) return setState("saved");
      setState("error");
      setMessage(e instanceof ApiError ? e.message : "Could not save.");
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message ? <span role="alert" className="text-sm text-risk-critical">{message}</span> : null}
      <Button variant={state === "saved" ? "outline" : "primary"} onClick={save} disabled={state === "busy" || state === "saved"} data-testid="save-comparison">
        {state === "saved" ? <><CheckIcon className="h-4 w-4 text-risk-low" /> Saved</> : state === "busy" ? "Saving…" : "Save comparison"}
      </Button>
    </div>
  );
}

export function DeleteComparisonButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title="Delete this saved comparison?"
      description="The two scans themselves are not affected."
      confirmLabel="Delete"
      onConfirm={async () => {
        await api(`/api/comparisons/${id}`, { method: "DELETE" });
        router.refresh();
      }}
      trigger={(open) => (
        <Button variant="ghost" size="icon" onClick={open} aria-label="Delete saved comparison">
          <TrashIcon className="h-[18px] w-[18px]" />
        </Button>
      )}
    />
  );
}
