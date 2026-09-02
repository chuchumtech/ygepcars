"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/**
 * Server-action submit button that disables and relabels itself while the
 * action is in flight, so nobody double-files a reservation request.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn-primary",
  formAction,
  form,
  name,
  value,
  onClick,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  /** Submits a form elsewhere in the document, e.g. from a dialog footer. */
  form?: string;
  name?: string;
  value?: string;
  onClick?: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      formAction={formAction}
      form={form}
      name={name}
      value={value}
      onClick={onClick}
    >
      {pending ? (pendingLabel ?? "Working...") : children}
    </button>
  );
}
