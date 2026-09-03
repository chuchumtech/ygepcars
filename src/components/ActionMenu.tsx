"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Where the panel sits, in viewport coordinates. */
type Spot = { top?: number; bottom?: number; right: number };

/**
 * The overflow menu for actions that are real but rare.
 *
 * A reservation has a dozen things the office can do to it and two they do
 * every time. Laying all twelve out as buttons made the two hard to find, so
 * everything else lives in here.
 */
export function ActionMenu({
  label = "More",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /**
   * The panel is positioned against the viewport rather than the button.
   *
   * These menus live inside a dialog whose body scrolls, and an absolutely
   * positioned panel was simply cut off at the bottom of it -- the last two
   * items, which are the destructive ones, were unreachable. Fixed positioning
   * escapes the scroll container; the flip keeps it on screen when the button
   * is near the bottom.
   */
  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const room = window.innerHeight - rect.bottom;
    const right = Math.max(8, window.innerWidth - rect.right);

    setSpot(
      room < 280
        ? { bottom: window.innerHeight - rect.top + 6, right }
        : { top: rect.bottom + 6, right },
    );
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    // Scrolling or resizing under an open menu leaves it stranded, so it
    // follows or closes rather than floating somewhere wrong.
    function reposition() {
      place();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => {
          place();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn-secondary btn-sm inline-flex items-center gap-1.5"
      >
        {label}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && spot ? (
        <div
          role="menu"
          style={{ top: spot.top, bottom: spot.bottom, right: spot.right }}
          // Anything in here that acts closes the menu, so the office is not
          // left looking at a stale list after the thing has happened.
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button")) setOpen(false);
          }}
          className="fixed z-[60] max-h-[70vh] w-60 overflow-y-auto overscroll-contain rounded-xl border border-line/70 bg-surface py-1 shadow-lift"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One row in the menu. Wraps whatever submits it -- these are nearly all
 * single-button server-action forms -- so every row looks the same.
 */
export function ActionMenuItem({
  children,
  tone = "normal",
}: {
  children: ReactNode;
  tone?: "normal" | "danger";
}) {
  return (
    <div
      className={`[&_button]:w-full [&_button]:px-3.5 [&_button]:py-2 [&_button]:text-left [&_button]:text-sm [&_button]:font-semibold [&_button]:transition ${
        tone === "danger"
          ? "[&_button]:text-bad [&_button:hover]:bg-red-50"
          : "[&_button]:text-ink [&_button:hover]:bg-parchment-deep"
      }`}
    >
      {children}
    </div>
  );
}

/** A labelled divider, so the menu reads in groups rather than as a list. */
export function ActionMenuGroup({ label }: { label: string }) {
  return (
    <p className="mt-1 border-t border-line/70 px-3.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-soft first:mt-0 first:border-t-0 first:pt-1">
      {label}
    </p>
  );
}
