"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { ModerationAction, ModerationStatus } from "@/lib/db/types";
import { Button, Input } from "@/components/ui/primitives";

const ACTIONS: { action: ModerationAction; label: string; variant: "primary" | "outline" | "danger-outline"; hideFor: ModerationStatus[] }[] = [
  { action: "approve", label: "Approve & publish", variant: "primary", hideFor: ["approved"] },
  { action: "reject", label: "Reject", variant: "outline", hideFor: ["rejected"] },
  { action: "remove", label: "Remove", variant: "danger-outline", hideFor: ["removed"] },
  { action: "requeue", label: "Back to queue", variant: "outline", hideFor: ["pending"] },
];

export function ModerationControls({ id, status }: { id: string; status: ModerationStatus }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<ModerationAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: ModerationAction) {
    if (reason.trim().length < 3) return setError("Enter a short reason (at least 3 characters). It is recorded in the moderation log.");
    setBusy(action);
    setError(null);
    try {
      await api(`/api/admin/reports/${id}/moderate`, { body: { action, reason } });
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Moderation failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 rounded-xl bg-canvas p-3">
      <label htmlFor={`reason-${id}`} className="text-xs font-semibold">Moderation reason (logged)</label>
      <Input id={`reason-${id}`} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Factual, no personal data" className="mt-0 bg-white" />
      <div className="flex flex-wrap gap-2">
        {ACTIONS.filter((a) => !a.hideFor.includes(status)).map((a) => (
          <Button key={a.action} size="sm" variant={a.variant} disabled={busy !== null} onClick={() => act(a.action)}>
            {busy === a.action ? "Saving…" : a.label}
          </Button>
        ))}
      </div>
      {error ? <p role="alert" className="text-sm text-risk-critical">{error}</p> : null}
    </div>
  );
}
