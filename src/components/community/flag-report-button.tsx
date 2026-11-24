"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, Label, Select, Textarea } from "@/components/ui/primitives";
import { FlagIcon } from "@/components/ui/icons";

const REASONS = [
  ["inaccurate", "Inaccurate or misleading"],
  ["personal_information", "Contains personal information"],
  ["harassment", "Harassment or defamation"],
  ["spam", "Spam or irrelevant"],
  ["other", "Other"],
] as const;

export function FlagReportButton({ id }: { id: string }) {
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>("inaccurate");
  const [details, setDetails] = useState("");
  const [done, setDone] = useState(false);

  if (done) return <span className="text-xs font-medium text-muted">Flagged for review — thank you</span>;

  return (
    <ConfirmDialog
      title="Flag this report for review"
      description="Moderators will re-check it. Reports flagged by several people are hidden until reviewed."
      confirmLabel="Submit flag"
      tone="primary"
      onConfirm={async () => {
        try {
          await api(`/api/reports/${id}/flag`, { body: { reason, details: details || undefined } });
          setDone(true);
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) return setDone(true);
          throw e;
        }
      }}
      trigger={(open) => (
        <Button variant="ghost" size="sm" onClick={open}>
          <FlagIcon className="h-4 w-4" /> Report abuse
        </Button>
      )}
    >
      <div className="mt-4 space-y-3">
        <div>
          <Label htmlFor={`reason-${id}`}>Reason</Label>
          <Select id={`reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor={`details-${id}`}>Details <span className="font-normal text-muted">(optional)</span></Label>
          <Textarea id={`details-${id}`} rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
        </div>
      </div>
    </ConfirmDialog>
  );
}
