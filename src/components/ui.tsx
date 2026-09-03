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
  pending: { label: "Pending", className: "bg-warn-light text-warn" },
  hold: { label: "On hold", className: "bg-gold-light text-gold" },
  approved: { label: "Approved", className: "bg-good-light text-good" },
  completed: { label: "Completed", className: "bg-parchment-deep text-ink-soft" },
  declined: { label: "Declined", className: "bg-bad-light text-bad" },
  cancelled: { label: "Cancelled", className: "bg-parchment-deep text-ink-soft" },
  released: { label: "Released", className: "bg-parchment-deep text-ink-soft" },
};

export function StatusBadge({ status }: { status: ReservationStatus }) {
  const style = RESERVATION_STATUS_STYLE[status];
  return <span className={`chip ${style.className}`}>{style.label}</span>;
}

const PROFILE_STATUS_STYLE: Record<
  ProfileStatus,
  { label: string; className: string }
> = {
  pending: { label: "Awaiting approval", className: "bg-warn-light text-warn" },
  active: { label: "Active", className: "bg-good-light text-good" },
  locked: { label: "Locked out", className: "bg-bad-light text-bad" },
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
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">{description}</p>
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
      <p className="text-base font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm text-ink-soft">{description}</p>
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
    default: "text-ink",
    warn: "text-warn",
    good: "text-good",
    bad: "text-bad",
  }[tone];

  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
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
      {hint && !error ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
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
    info: "border-brand-light bg-brand-light/60 text-brand-dark",
    success: "border-good-light bg-good-light text-good",
    warn: "border-warn-light bg-warn-light text-warn",
    error: "border-bad-light bg-bad-light text-bad",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-0.5" : ""}>{children}</div> : null}
    </div>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-6 border-b border-line/70 py-2.5 last:border-0">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/**
 * A section the office can put away. Built on <details> so the open state is
 * the browser's business, it survives without JavaScript, and Ctrl-F finds
 * text inside a closed one in browsers that support it.
 */
export function Collapsible({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-line/70 bg-surface open:bg-parchment/30"
    >
      <summary className="tap flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-ink marker:content-none">
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className="shrink-0 text-ink-soft transition group-open:rotate-90"
        >
          <path
            d="M6 3l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="flex-1">{title}</span>
        {hint ? (
          <span className="text-xs font-semibold text-ink-soft group-open:hidden">{hint}</span>
        ) : null}
      </summary>
      <div className="border-t border-line/70 px-4 py-4">{children}</div>
    </details>
  );
}
