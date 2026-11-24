import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AlertIcon, CheckIcon, InfoIcon } from "./icons";

// ----------------------------------------------------------------- Button

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
        secondary: "bg-brand-50 text-brand-800 hover:bg-brand-100",
        outline: "border border-line bg-white text-ink hover:border-brand-200 hover:bg-brand-50",
        ghost: "text-ink-soft hover:bg-brand-50 hover:text-ink",
        danger: "bg-risk-critical text-white hover:bg-[#931c24]",
        "danger-outline": "border border-[#f3c3c8] bg-white text-risk-critical hover:bg-risk-critical-bg",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>;

export function ButtonLink({ className, variant, size, ...props }: ButtonLinkProps) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

// ----------------------------------------------------------------- Card

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section data-card className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function CardHeader({ title, description, action, as: As = "h2" }: { title: ReactNode; description?: ReactNode; action?: ReactNode; as?: "h1" | "h2" | "h3" }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <As className="text-base font-semibold text-ink">{title}</As>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-5 sm:px-6", className)} {...props} />;
}

// ----------------------------------------------------------------- Page header

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 no-print">{actions}</div> : null}
    </div>
  );
}

// ----------------------------------------------------------------- Alerts

const alertStyles = {
  info: { box: "border-brand-200 bg-brand-50 text-brand-800", Icon: InfoIcon, label: "Note" },
  success: { box: "border-[#b9e4cb] bg-risk-low-bg text-risk-low", Icon: CheckIcon, label: "Success" },
  warning: { box: "border-[#f5d9a0] bg-risk-medium-bg text-risk-medium", Icon: AlertIcon, label: "Warning" },
  danger: { box: "border-[#f3c3c8] bg-risk-critical-bg text-risk-critical", Icon: AlertIcon, label: "Error" },
} as const;

export function Alert({ tone = "info", title, children, className, role }: { tone?: keyof typeof alertStyles; title?: ReactNode; children?: ReactNode; className?: string; role?: "alert" | "status" }) {
  const s = alertStyles[tone];
  return (
    <div role={role ?? (tone === "danger" ? "alert" : "status")} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", s.box, className)}>
      <s.Icon className="mt-0.5 h-5 w-5 shrink-0" title={s.label} />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-ink-soft [&_a]:font-medium [&_a]:underline">{children}</div> : null}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Form fields

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-sm font-semibold text-ink", className)} {...props} />;
}

const fieldBase =
  "mt-1.5 block w-full rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink placeholder:text-muted/80 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 aria-[invalid=true]:border-risk-critical aria-[invalid=true]:ring-risk-critical-bg disabled:bg-canvas";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "py-3 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "h-11 pr-8", className)} {...props} />;
}

export function FieldHint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-xs text-muted">
      {children}
    </p>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-risk-critical">
      <AlertIcon className="h-4 w-4 shrink-0" />
      {message}
    </p>
  );
}

// ----------------------------------------------------------------- Misc

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center", className)}>
      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon ? <div className="mb-3 rounded-2xl bg-brand-50 p-3 text-2xl text-brand-600">{icon}</div> : null}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs leading-relaxed text-muted", className)}>
      <strong className="font-semibold text-ink-soft">JobShield AI is an advisory screening tool.</strong> Its findings are not legal determinations or proof of fraud.
      Always verify opportunities independently.
    </p>
  );
}
