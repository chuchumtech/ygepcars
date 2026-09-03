"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Dialog built on <dialog> so focus trapping, Esc-to-close and the top layer
 * come from the platform rather than from us re-implementing them.
 *
 * `m-auto` is load-bearing: the browser centres a modal dialog by pinning all
 * four insets and letting `margin: auto` do the rest, and Tailwind's preflight
 * sets `margin: 0` on every element, which drops the dialog into the top-left
 * corner. Putting the margin back is what centres it.
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

  // Roomier than the old scale across the board: these dialogs carry real
  // forms, and cramming them into a narrow column meant fields stacked that
  // had no reason to.
  const maxWidth = {
    sm: "max-w-lg",
    md: "max-w-2xl",
    lg: "max-w-4xl",
    xl: "max-w-6xl",
  }[width];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // Clicking the backdrop -- the dialog element itself -- dismisses.
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100vw-1.5rem)] ${maxWidth} rounded-2xl border border-line/70 bg-surface p-0 shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]`}
    >
      {open ? (
        <div className="flex max-h-[88dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line/70 px-6 py-4">
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

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

          {footer ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line/70 bg-parchment px-6 py-4">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
