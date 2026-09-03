"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Dialog built on <dialog> so focus trapping, Esc-to-close and the top layer
 * come from the platform rather than from us re-implementing them.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "lg",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const maxWidth = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  }[width];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // Clicking the backdrop -- the dialog element itself -- dismisses.
        if (event.target === ref.current) onClose();
      }}
      className={`w-[calc(100vw-2rem)] ${maxWidth} rounded-2xl border border-line/70 bg-white p-0 shadow-2xl backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]`}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line/70 px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-ink">{title}</h2>
              {subtitle ? (
                <div className="mt-0.5 text-sm text-ink-soft">{subtitle}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-1 rounded-lg p-1.5 text-ink-soft transition hover:bg-parchment-deep hover:text-ink"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {footer ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line/70 bg-parchment/50 px-5 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
