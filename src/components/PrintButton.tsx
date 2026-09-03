"use client";

/** Triggers the browser's print dialog. Print styles do the rest. */
export function PrintButton({
  label = "Print",
  className = "btn-secondary btn-sm",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button type="button" className={`no-print ${className}`} onClick={() => window.print()}>
      {label}
    </button>
  );
}
