"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert, Button, Card, CardBody, CardHeader, FieldHint, Input, Label } from "@/components/ui/primitives";
import { DocumentIcon, TrashIcon } from "@/components/ui/icons";

export function ProfileForm({ initialName, initialStore }: { initialName: string; initialStore: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [store, setStore] = useState(initialStore);
  const [status, setStatus] = useState<{ tone: "success" | "danger"; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await api("/api/account", { method: "PATCH", body: { display_name: name.trim() || null, store_scan_text: store } });
      setStatus({ tone: "success", msg: "Settings saved." });
      router.refresh();
    } catch (err) {
      setStatus({ tone: "danger", msg: err instanceof ApiError ? err.message : "Could not save settings." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Profile & privacy" />
      <form onSubmit={save}>
        <CardBody className="space-y-5">
          <div>
            <Label htmlFor="display_name">Display name</Label>
            <Input id="display_name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex items-start gap-3">
            <input id="store" type="checkbox" className="mt-1 h-4 w-4" checked={store} onChange={(e) => setStore(e.target.checked)} />
            <div>
              <label htmlFor="store" className="text-sm font-semibold">Keep the advertisement text with my scans</label>
              <FieldHint>
                When off, new scans store only the report (with its short evidence quotes) and a fingerprint of the text — not the full advertisement. Sensitive numbers are always removed before storage.
              </FieldHint>
            </div>
          </div>
          {status ? <Alert tone={status.tone}>{status.msg}</Alert> : null}
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button>
        </CardBody>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const [pw, setPw] = useState("");
  const [status, setStatus] = useState<{ tone: "success" | "danger"; msg: string } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return setStatus({ tone: "danger", msg: "Use at least 10 characters with a letter and a number." });
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setStatus({ tone: "danger", msg: "Authentication is not configured." });
    const { error } = await supabase.auth.updateUser({ password: pw });
    setStatus(error ? { tone: "danger", msg: error.message } : { tone: "success", msg: "Password updated." });
    if (!error) setPw("");
  }
  return (
    <Card>
      <CardHeader title="Change password" />
      <form onSubmit={save}>
        <CardBody className="space-y-4">
          <div>
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          {status ? <Alert tone={status.tone}>{status.msg}</Alert> : null}
          <Button type="submit" variant="outline">Update password</Button>
        </CardBody>
      </form>
    </Card>
  );
}

export function DataControls({ canDeleteAccount }: { canDeleteAccount: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function del(scope: "data" | "account") {
    const res = await api<{ scans: number; reports: number }>("/api/account", { method: "DELETE", body: { scope, confirm: "DELETE" } });
    if (scope === "account") {
      await getSupabaseBrowserClient()?.auth.signOut();
      router.replace("/?account=deleted");
      router.refresh();
      return;
    }
    setMsg(`Deleted ${res.scans} scan(s) and ${res.reports} report(s).`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader title="Your data" description="Export or permanently delete what JobShield stores about you." />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Export my data</p>
            <p className="text-sm text-ink-soft">Download your profile, scans, comparisons and reports as JSON.</p>
          </div>
          <a href="/api/account/export" download className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold hover:bg-brand-50">
            <DocumentIcon className="h-4 w-4" /> Export JSON
          </a>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <div>
            <p className="text-sm font-semibold">Delete all my data</p>
            <p className="text-sm text-ink-soft">Deletes every scan, saved comparison and community report. Your account stays.</p>
          </div>
          <ConfirmDialog
            title="Delete all your data?"
            description="This permanently deletes all scans, comparisons and community reports. It cannot be undone."
            confirmLabel="Delete my data"
            requireText="DELETE"
            onConfirm={() => del("data")}
            trigger={(open) => <Button variant="danger-outline" onClick={open}><TrashIcon className="h-4 w-4" /> Delete data</Button>}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <div>
            <p className="text-sm font-semibold">Delete my account</p>
            <p className="text-sm text-ink-soft">Deletes all data and your login. {canDeleteAccount ? "" : "Not available on this server yet — delete your data above, or contact the administrator."}</p>
          </div>
          <ConfirmDialog
            title="Delete your account?"
            description="Your account and everything in it will be permanently deleted. You'll be signed out."
            confirmLabel="Delete account"
            requireText="DELETE"
            onConfirm={() => del("account")}
            trigger={(open) => <Button variant="danger" onClick={open} disabled={!canDeleteAccount}><TrashIcon className="h-4 w-4" /> Delete account</Button>}
          />
        </div>
        {msg ? <Alert tone="success">{msg}</Alert> : null}
      </CardBody>
    </Card>
  );
}
