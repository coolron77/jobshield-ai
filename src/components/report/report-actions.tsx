"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Report } from "@/lib/analysis/schema";
import { api } from "@/lib/api-client";
import { reportToText } from "@/lib/report-text";
import { Button, ButtonLink } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CheckIcon, CopyIcon, FlagIcon, PrinterIcon, TrashIcon } from "@/components/ui/icons";

export function ReportActions({ report, scanId, title, url, createdAt }: { report: Report; scanId?: string; title?: string; url?: string | null; createdAt?: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(reportToText(report, { title, url, createdAt }));
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 2500);
  }

  return (
    <div className="flex flex-wrap gap-2 no-print">
      <Button variant="outline" size="sm" onClick={copy} aria-live="polite">
        {copied === "ok" ? <CheckIcon className="h-4 w-4 text-risk-low" /> : <CopyIcon className="h-4 w-4" />}
        {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Copy report"}
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <PrinterIcon className="h-4 w-4" /> Print
      </Button>
      {scanId ? (
        <>
          <ButtonLink href={`/community/new?scan=${scanId}`} variant="outline" size="sm">
            <FlagIcon className="h-4 w-4" /> Report to community
          </ButtonLink>
          <ConfirmDialog
            title="Delete this scan?"
            description="The report and its stored text will be permanently deleted. Saved comparisons using it will also be removed."
            confirmLabel="Delete scan"
            onConfirm={async () => {
              await api(`/api/scans/${scanId}`, { method: "DELETE" });
              router.push("/scans");
              router.refresh();
            }}
            trigger={(open) => (
              <Button variant="danger-outline" size="sm" onClick={open}>
                <TrashIcon className="h-4 w-4" /> Delete
              </Button>
            )}
          />
        </>
      ) : null}
    </div>
  );
}
