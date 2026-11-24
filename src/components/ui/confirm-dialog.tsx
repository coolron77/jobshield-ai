"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "./primitives";

/**
 * Accessible confirmation dialog built on the native <dialog> element
 * (focus trapping, Escape to close and inert background come for free).
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  requireText,
  onConfirm,
  children,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  /** If set, the user must type this exact text to enable the confirm button. */
  requireText?: string;
  onConfirm: () => Promise<void> | void;
  children?: ReactNode;
}) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const onClose = () => {
      setTyped("");
      setError(null);
    };
    dialog?.addEventListener("close", onClose);
    return () => dialog?.removeEventListener("close", onClose);
  }, [dialog]);

  const open = () => dialog?.showModal();
  const close = () => dialog?.close();

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {trigger(open)}
      <dialog
        ref={setDialog}
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-line bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/40"
      >
        <div className="p-6">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description ? (
            <div id={descId} className="mt-2 text-sm text-ink-soft">
              {description}
            </div>
          ) : null}
          {children}
          {requireText ? (
            <label className="mt-4 block text-sm">
              <span className="font-medium">
                Type <code className="rounded bg-canvas px-1 font-mono">{requireText}</code> to confirm
              </span>
              <input
                className="mt-1.5 block h-11 w-full rounded-xl border border-line px-3"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 text-sm font-medium text-risk-critical">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant={tone === "danger" ? "danger" : "primary"} onClick={confirm} disabled={busy || (requireText ? typed !== requireText : false)}>
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
