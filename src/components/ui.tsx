import Link from "next/link";
import type { ReactNode } from "react";
import type { ProfileStatus, ReservationStatus } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Status badges                                                              */
/* -------------------------------------------------------------------------- */

const RESERVATION_STATUS_STYLE: Record<
  ReservationStatus,
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800" },
  completed: { label: "Completed", className: "bg-navy-100 text-navy-700" },
  declined: { label: "Declined", className: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", className: "bg-navy-100 text-muted" },
};

export function StatusBadge({ status }: { status: ReservationStatus }) {
  const style = RESERVATION_STATUS_STYLE[status];
  return <span className={`chip ${style.className}`}>{style.label}</span>;
}

const PROFILE_STATUS_STYLE: Record<
  ProfileStatus,
  { label: string; className: string }
> = {
  pending: { label: "Awaiting approval", className: "bg-amber-100 text-amber-800" },
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800" },
  locked: { label: "Locked out", className: "bg-red-100 text-red-700" },
};

export function ProfileBadge({ status }: { status: ProfileStatus }) {
  const style = PROFILE_STATUS_STYLE[status];
  return <span className={`chip ${style.className}`}>{style.label}</span>;
}

/* -------------------------------------------------------------------------- */
/* Layout primitives                                                          */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-800">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-base font-semibold text-navy-800">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "good" | "bad";
  href?: string;
}) {
  const toneClass = {
    default: "text-navy-800",
    warn: "text-amber-700",
    good: "text-emerald-700",
    bad: "text-red-700",
  }[tone];

  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </>
  );

  return href ? (
    <Link href={href} className="card-pad block transition hover:border-navy-300 hover:shadow-sm">
      {body}
    </Link>
  ) : (
    <div className="card-pad">{body}</div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs font-medium text-red-700">{error}</p> : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warn" | "error";
  title?: string;
  children?: ReactNode;
}) {
  const styles = {
    info: "border-navy-200 bg-navy-50 text-navy-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
  }[tone];

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-0.5" : ""}>{children}</div> : null}
    </div>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-6 border-b border-[var(--color-line)] py-2.5 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-navy-800">{children}</dd>
    </div>
  );
}
