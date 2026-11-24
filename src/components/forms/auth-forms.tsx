"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/safe-redirect";
import { Alert, Button, Card, CardBody, FieldError, FieldHint, Input, Label } from "@/components/ui/primitives";

const NOT_CONFIGURED = "Authentication isn't configured on this server yet (missing Supabase settings).";

function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card>
      <CardBody className="space-y-6 py-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-ink-soft">{subtitle}</p> : null}
        </div>
        {children}
        {footer ? <div className="border-t border-line pt-4 text-sm text-ink-soft">{footer}</div> : null}
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------ Login

const LoginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email.").email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
type LoginValues = z.infer<typeof LoginSchema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const linkError = params.get("error");
  const [error, setError] = useState<string | null>(linkError === "link_invalid" ? "That link is invalid or has expired. Please try again." : null);
  const { register, handleSubmit, formState } = useForm<LoginValues>({ resolver: zodResolver(LoginSchema) });

  async function onSubmit(values: LoginValues) {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError(NOT_CONFIGURED);
    const { error: err } = await supabase.auth.signInWithPassword(values);
    if (err) return setError(err.message === "Email not confirmed" ? "Please confirm your email address first — check your inbox." : "Incorrect email or password.");
    router.replace(next);
    router.refresh();
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to scan job ads and see your saved reports."
      footer={
        <>
          New here? <Link className="font-semibold text-brand-700 hover:underline" href={`/signup${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create a free account</Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} aria-describedby="email-error" {...register("email")} />
          <FieldError id="email-error" message={formState.errors.email?.message} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">Forgot password?</Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} aria-describedby="password-error" {...register("password")} />
          <FieldError id="password-error" message={formState.errors.password?.message} />
        </div>
        <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthCard>
  );
}

// ------------------------------------------------------------------ Sign up

const PasswordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(72, "Use at most 72 characters.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/\d/, "Include at least one number.");

const SignupSchema = z
  .object({
    display_name: z.string().trim().max(80, "Keep it under 80 characters."),
    email: z.string().trim().min(1, "Enter your email.").email("Enter a valid email address."),
    password: PasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match.", path: ["confirm"] });
type SignupValues = z.infer<typeof SignupSchema>;

export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<SignupValues>({ resolver: zodResolver(SignupSchema), defaultValues: { display_name: "" } });

  async function onSubmit(values: SignupValues) {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError(NOT_CONFIGURED);
    const { data, error: err } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Only the display name is sent; roles are assigned server-side.
        data: values.display_name ? { display_name: values.display_name } : undefined,
      },
    });
    if (err) return setError(err.message);
    if (data.session) {
      router.replace(next);
      router.refresh();
    } else {
      setSentTo(values.email);
    }
  }

  if (sentTo) {
    return (
      <AuthCard title="Check your email" subtitle={`We sent a confirmation link to ${sentTo}. Open it to activate your account.`}>
        <Alert tone="info">Didn&apos;t get it? Check your spam folder, or try signing up again in a few minutes.</Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your free account"
      subtitle="Save scans, compare offers and contribute community reports."
      footer={
        <>
          Already have an account? <Link className="font-semibold text-brand-700 hover:underline" href="/login">Log in</Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div>
          <Label htmlFor="display_name">Name <span className="font-normal text-muted">(optional)</span></Label>
          <Input id="display_name" autoComplete="nickname" {...register("display_name")} aria-describedby="name-error" />
          <FieldError id="name-error" message={formState.errors.display_name?.message} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} aria-describedby="email-error" {...register("email")} />
          <FieldError id="email-error" message={formState.errors.email?.message} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.password} aria-describedby="password-hint password-error" {...register("password")} />
          <FieldHint id="password-hint">At least 10 characters, with a letter and a number.</FieldHint>
          <FieldError id="password-error" message={formState.errors.password?.message} />
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.confirm} aria-describedby="confirm-error" {...register("confirm")} />
          <FieldError id="confirm-error" message={formState.errors.confirm?.message} />
        </div>
        <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}

// ------------------------------------------------------------------ Forgot password

const ForgotSchema = z.object({ email: z.string().trim().min(1, "Enter your email.").email("Enter a valid email address.") });

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof ForgotSchema>>({ resolver: zodResolver(ForgotSchema) });

  async function onSubmit({ email }: z.infer<typeof ForgotSchema>) {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError(NOT_CONFIGURED);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    // Same message whether or not the account exists (no account enumeration),
    // except for rate limiting, which the user needs to know about.
    if (err && err.status === 429) return setError("Too many requests. Please wait a few minutes and try again.");
    setSent(true);
  }

  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new password." footer={<Link className="font-semibold text-brand-700 hover:underline" href="/login">Back to log in</Link>}>
      {sent ? (
        <Alert tone="success" title="Check your email">If an account exists for that address, a reset link is on its way.</Alert>
      ) : (
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} aria-describedby="email-error" {...register("email")} />
            <FieldError id="email-error" message={formState.errors.email?.message} />
          </div>
          <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

// ------------------------------------------------------------------ Reset password

const ResetSchema = z
  .object({ password: PasswordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match.", path: ["confirm"] });

export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof ResetSchema>>({ resolver: zodResolver(ResetSchema) });

  async function onSubmit({ password }: z.infer<typeof ResetSchema>) {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError(NOT_CONFIGURED);
    const { data } = await supabase.auth.getUser();
    if (!data.user) return setError("Your reset link has expired. Request a new one from the 'Forgot password' page.");
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) return setError(err.message);
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <AuthCard title="Choose a new password">
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div>
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.password} aria-describedby="password-hint password-error" {...register("password")} />
          <FieldHint id="password-hint">At least 10 characters, with a letter and a number.</FieldHint>
          <FieldError id="password-error" message={formState.errors.password?.message} />
        </div>
        <div>
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.confirm} aria-describedby="confirm-error" {...register("confirm")} />
          <FieldError id="confirm-error" message={formState.errors.confirm?.message} />
        </div>
        <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </AuthCard>
  );
}
