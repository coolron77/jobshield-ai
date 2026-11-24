import type { Metadata } from "next";
import { getServerEnv } from "@/lib/env";
import { requirePageContext } from "@/server/session";
import { DataControls, PasswordForm, ProfileForm } from "@/components/settings/settings-forms";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { ctx, session } = await requirePageContext("/settings");
  const profile = await ctx.profiles.get(session.user.id);
  const canDeleteAccount = Boolean(getServerEnv().serviceRoleKey);
  return (
    <>
      <PageHeader title="Profile & settings" description="Manage your account, privacy and data." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Account" />
          <CardBody>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted">Email</dt><dd className="font-medium">{session.user.email ?? "—"}</dd>
              <dt className="text-muted">Role</dt><dd className="font-medium capitalize">{profile?.role ?? "user"}</dd>
              <dt className="text-muted">Member since</dt><dd>{formatDate(profile?.created_at)}</dd>
            </dl>
          </CardBody>
        </Card>
        <ProfileForm initialName={profile?.display_name ?? ""} initialStore={profile?.store_scan_text ?? true} />
        <PasswordForm />
        <DataControls canDeleteAccount={canDeleteAccount} />
        <Card>
          <CardHeader title="What we send to Claude" />
          <CardBody className="space-y-2 text-sm text-ink-soft">
            <p>Only the advertisement text (with card, bank, ID, password, one-time-code and phone numbers removed), the link you provided and the company name you entered. Never your account details or password.</p>
            <p>Analysis runs on our server; your browser never talks to the AI provider directly.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
