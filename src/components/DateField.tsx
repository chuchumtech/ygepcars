"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  dateRangeList,
  parseLocalDate,
  shiftDays,
  shiftMonths,
  startOfWeek,
  endOfMonth,
  startOfMonth,
} from "@/lib/calendar";
import { todayLocal } from "@/lib/dates";
import type { HebrewMonth } from "@/lib/hebrew";
import { useOffShabbosim, type OffShabbosim } from "@/components/OffShabbosimProvider";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** How each covered day of an off Shabbos reads in a tooltip. */
const PART = { friday: "Friday", shabbos: "Shabbos", sunday: "Sunday" } as const;

/** Where a day sits in the current selection. */
type CellState = "start" | "end" | "both" | "middle" | null;

function asUtc(date: string): Date {
  const { y, m, d } = parseLocalDate(date);
  return new Date(Date.UTC(y, m - 1, d));
}

function monthTitle(anchor: string): string {
  const { y, m } = parseLocalDate(anchor);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function dayLabel(value: string): string {
  if (!value) return "Pick a day";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(asUtc(value));
}

/** Whole days from one date to the next, both ends inclusive of the pickup. */
function daysBetween(from: string, to: string): number {
  return Math.round((asUtc(to).getTime() - asUtc(from).getTime()) / 86_400_000);
}

function nightsLabel(start: string, end: string): string {
  if (!start || !end) return "";
  const nights = daysBetween(start, end);
  if (nights <= 0) return "Same day";
  return nights === 1 ? "1 night" : `${nights} nights`;
}

/**
 * Load the Hebrew annotations for whichever grid is on screen.
 *
 * The Hebrew calendar tables are a couple of hundred kilobytes, so they are
 * fetched only once somebody actually opens a picker, and every grid renders
 * complete without them in the meantime.
 */
function useHebrewNotes(open: boolean, days: string[]): HebrewMonth {
  const [notes, setNotes] = useState<HebrewMonth>(new Map());
  const first = days[0];
  const last = days[days.length - 1];

  useEffect(() => {
    if (!open || !first || !last) return;
    let cancelled = false;

    import("@/lib/hebrew")
      .then(({ loadHebrewMonth }) => {
        const a = parseLocalDate(first);
        const b = parseLocalDate(last);
        return loadHebrewMonth(
          new Date(a.y, a.m - 1, a.d),
          new Date(b.y, b.m - 1, b.d),
        );
      })
      .then((loaded) => {
        if (!cancelled) setNotes(loaded);
      })
      .catch(() => {
        // Without them it is still a working calendar.
      });

    return () => {
      cancelled = true;
    };
  }, [open, first, last]);

  return notes;
}

/** Close the popup on an outside click or Escape. */
function useDismiss(
  open: boolean,
  ref: React.RefObject<HTMLDivElement | null>,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, ref, close]);
}

function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="shrink-0 text-ink-soft"
    >
      <rect x="3" y="4.5" width="14" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8.5h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The month grid itself. Every day carries its Hebrew date, every Shabbos its
 * parsha, yom tov is tinted, and a Shabbos the office has flagged as off is
 * called out by name.
 */
function CalendarPanel({
  label,
  anchor,
  onAnchor,
  min,
  max,
  offShabbosim,
  today,
  stateOf,
  onPick,
  onHover,
  hint,
  open,
}: {
  label: string;
  anchor: string;
  onAnchor: (next: string) => void;
  min?: string;
  max?: string;
  offShabbosim: OffShabbosim;
  today: string;
  stateOf: (day: string) => CellState;
  onPick: (day: string) => void;
  onHover?: (day: string | null) => void;
  hint?: string;
  open: boolean;
}) {
  const days = useMemo(() => {
    const first = startOfWeek(startOfMonth(anchor));
    const last = shiftDays(startOfWeek(endOfMonth(anchor)), 6);
    return dateRangeList(first, last);
  }, [anchor]);

  const notes = useHebrewNotes(open, days);
  const anchorMonth = parseLocalDate(anchor).m;
  // Only give up the extra row of height when this month actually has one.
  const anyOff = days.some((day) => offShabbosim[day]);

  return (
    <div
      role="dialog"
      aria-label={label}
      className="absolute inset-x-0 top-full z-50 mt-2 min-w-[20rem] rounded-2xl border border-line/70 bg-surface p-3 shadow-lift"
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="tap rounded-lg p-2 text-ink-soft transition hover:bg-parchment-deep hover:text-ink"
          onClick={() => onAnchor(shiftMonths(anchor, -1))}
          aria-label="Previous month"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <p className="text-sm font-bold text-ink">{monthTitle(anchor)}</p>

        <button
          type="button"
          className="tap rounded-lg p-2 text-ink-soft transition hover:bg-parchment-deep hover:text-ink"
          onClick={() => onAnchor(shiftMonths(anchor, 1))}
          aria-label="Next month"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {hint ? (
        <p className="mb-1.5 text-center text-xs font-semibold text-brand">{hint}</p>
      ) : null}

      <div className="grid grid-cols-7">
        {WEEKDAYS.map((day, index) => (
          <div
            key={index}
            className="pb-1 text-center text-[10px] font-bold uppercase tracking-wide text-ink-soft"
          >
            {day}
          </div>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-y-0.5"
        onMouseLeave={onHover ? () => onHover(null) : undefined}
      >
        {days.map((day) => {
          const note = notes.get(day);
          const inMonth = parseLocalDate(day).m === anchorMonth;
          const disabled = Boolean((min && day < min) || (max && day > max));
          const state = stateOf(day);
          const edge = state === "start" || state === "end" || state === "both";
          const isToday = day === today;
          const off = offShabbosim[day];
          const reading = note?.parsha ?? (note?.isYomTov ? note.holiday : undefined);

          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => onPick(day)}
              onMouseEnter={onHover && !disabled ? () => onHover(day) : undefined}
              title={[
                note?.hebrew,
                note?.parshaEn ? `Parshas ${note.parshaEn}` : null,
                note?.holidayEn,
                off ? `${off.label} — the yeshiva is off this ${PART[off.part]}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              className={[
                `tap flex ${anyOff ? "h-[4.6rem]" : "h-[3.9rem]"} flex-col items-center justify-center px-1 transition`,
                state === "both" || state === null ? "rounded-lg" : "",
                state === "start" ? "rounded-l-lg" : "",
                state === "end" ? "rounded-r-lg" : "",
                edge
                  ? "bg-brand text-white"
                  : state === "middle"
                    ? "bg-brand-light text-ink"
                    : disabled
                      ? "cursor-not-allowed text-ink-soft/30"
                      : inMonth
                        ? "text-ink hover:bg-parchment-deep"
                        : "text-ink-soft/50 hover:bg-parchment-deep",
                !edge && isToday ? "ring-1 ring-brand" : "",
                // One background, decided here rather than by whichever of
                // several conflicting utilities the stylesheet happens to
                // emit last.
                edge || state === "middle"
                  ? ""
                  : note?.isYomTov
                    ? "bg-gold-light"
                    : off
                      ? "bg-brand-light"
                      : note?.holiday
                        ? "bg-gold-light/40"
                        : "",
              ].join(" ")}
            >
              <span className="text-sm font-semibold leading-none">
                {parseLocalDate(day).d}
              </span>
              {note ? (
                <span
                  className={`mt-0.5 text-[10px] leading-none ${
                    edge ? "text-white/80" : "text-ink-soft"
                  }`}
                >
                  {note.hebrewDay}
                </span>
              ) : null}
              {reading ? (
                <span
                  dir="rtl"
                  className={`mt-0.5 w-full truncate text-center text-[10px] leading-tight ${
                    edge
                      ? "text-white/80"
                      : note?.isYomTov
                        ? "font-bold text-gold"
                        : "text-ink-soft"
                  }`}
                >
                  {reading}
                </span>
              ) : null}
              {off ? (
                <span
                  className={`mt-0.5 max-w-full truncate rounded-full px-1.5 py-px text-[9px] font-bold leading-tight ${
                    edge ? "bg-white/25 text-white" : "bg-brand text-white"
                  }`}
                >
                  {off.label}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-line/70 pt-2">
        <div className="flex items-center gap-3 text-[10px] text-ink-soft">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded bg-gold-light" aria-hidden />
            Yom tov
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded bg-brand-light" aria-hidden />
            Off Shabbos
          </span>
        </div>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-xs font-bold text-brand transition hover:bg-brand-light"
          onClick={() => onAnchor(today)}
        >
          Today
        </button>
      </div>
    </div>
  );
}

/**
 * One calendar for both ends of a rental: pick the pickup day, pick the return
 * day, and everything in between is highlighted as you go.
 */
export function DateRangeField({
  startDate,
  endDate,
  onChange,
  min,
  max,
  offShabbosim,
  startName,
  endName,
  startLabel = "Pick up",
  endLabel = "Return",
  id,
}: {
  startDate: string;
  endDate: string;
  onChange: (next: { startDate: string; endDate: string }) => void;
  min?: string;
  max?: string;
  /** Overrides the off Shabbosim the layout already provides. */
  offShabbosim?: OffShabbosim;
  /** When given, hidden inputs are rendered so the field works in a plain form. */
  startName?: string;
  endName?: string;
  startLabel?: string;
  endLabel?: string;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  /** Which end the next click lands on. */
  const [picking, setPicking] = useState<"start" | "end">("start");
  /** Set once the pickup is chosen and we are waiting on the return. */
  const [draftStart, setDraftStart] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => startDate || todayLocal());
  const wrapRef = useRef<HTMLDivElement>(null);

  const fromLayout = useOffShabbosim();
  const marked = offShabbosim ?? fromLayout;
  const today = useMemo(() => todayLocal(), []);

  function close() {
    setOpen(false);
    setDraftStart(null);
    setHover(null);
  }
  useDismiss(open, wrapRef, close);

  function openAt(end: "start" | "end") {
    setPicking(end);
    setDraftStart(null);
    setHover(null);
    setAnchor((end === "end" ? endDate : startDate) || today);
    setOpen(true);
  }

  function pick(day: string) {
    // Waiting on the return half of a range.
    if (draftStart) {
      if (day < draftStart) {
        setDraftStart(day);
        return;
      }
      onChange({ startDate: draftStart, endDate: day });
      close();
      return;
    }

    // Moving only the return, with the pickup already where it belongs.
    if (picking === "end" && day >= startDate) {
      onChange({ startDate, endDate: day });
      close();
      return;
    }

    // A fresh pickup: hold it and wait for the return.
    setDraftStart(day);
    setPicking("end");
  }

  // What the grid should paint, including the day being hovered over.
  const from = draftStart ?? startDate;
  const to = draftStart ? (hover && hover >= draftStart ? hover : null) : endDate;

  function stateOf(day: string): CellState {
    if (!from) return null;
    if (!to) return day === from ? "both" : null;
    if (day === from && day === to) return "both";
    if (day === from) return "start";
    if (day === to) return "end";
    return day > from && day < to ? "middle" : null;
  }

  const segment = "flex-1 rounded-xl px-3 py-2 text-left transition";

  return (
    <div className="relative" ref={wrapRef}>
      {startName ? <input type="hidden" name={startName} value={startDate} /> : null}
      {endName ? <input type="hidden" name={endName} value={endDate} /> : null}

      <div
        className={`flex items-center gap-1 rounded-2xl border bg-surface p-1 ${
          open ? "border-brand ring-2 ring-brand/20" : "border-line"
        }`}
      >
        <button
          type="button"
          id={id}
          onClick={() => openAt("start")}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`${segment} ${
            open && picking === "start" && !draftStart ? "bg-brand-light" : "hover:bg-parchment-deep"
          }`}
        >
          <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-soft">
            {startLabel}
          </span>
          <span className="block text-sm font-semibold text-ink">
            {dayLabel(draftStart ?? startDate)}
          </span>
        </button>

        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-ink-soft">
          <path d="M3 8h10m-4-4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <button
          type="button"
          onClick={() => openAt("end")}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`${segment} ${
            open && (draftStart || picking === "end") ? "bg-brand-light" : "hover:bg-parchment-deep"
          }`}
        >
          <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-soft">
            {endLabel}
          </span>
          <span className="block text-sm font-semibold text-ink">
            {draftStart ? "Pick a day" : dayLabel(endDate)}
          </span>
        </button>

        <span className="hidden shrink-0 px-2 text-xs font-semibold text-ink-soft sm:block">
          {draftStart ? "" : nightsLabel(startDate, endDate)}
        </span>

        <span className="px-2">
          <CalendarIcon />
        </span>
      </div>

      {open ? (
        <CalendarPanel
          open={open}
          label={`${startLabel} and ${endLabel} dates`}
          anchor={anchor}
          onAnchor={setAnchor}
          min={min}
          max={max}
          offShabbosim={marked}
          today={today}
          stateOf={stateOf}
          onPick={pick}
          onHover={draftStart ? setHover : undefined}
          hint={draftStart ? "Now pick the day it comes back" : undefined}
        />
      ) : null}
    </div>
  );
}

/** The same calendar for a single date, used where there is no range to pick. */
export function DateField({
  value,
  onChange,
  min,
  max,
  offShabbosim,
  name,
  label,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  min?: string;
  max?: string;
  offShabbosim?: OffShabbosim;
  name?: string;
  label: string;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(() => value || todayLocal());
  const wrapRef = useRef<HTMLDivElement>(null);

  const fromLayout = useOffShabbosim();
  const marked = offShabbosim ?? fromLayout;
  const today = useMemo(() => todayLocal(), []);

  const close = () => setOpen(false);
  useDismiss(open, wrapRef, close);

  return (
    <div className="relative" ref={wrapRef}>
      {name ? <input type="hidden" name={name} value={value} /> : null}

      <button
        type="button"
        id={id}
        onClick={() => {
          setAnchor(value || today);
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        className="input tap flex items-center justify-between gap-2 text-left"
      >
        <span className={value ? "text-ink" : "text-ink-soft"}>
          {value ? dayLabel(value) : "Pick a date"}
        </span>
        <CalendarIcon />
      </button>

      {open ? (
        <CalendarPanel
          open={open}
          label={label}
          anchor={anchor}
          onAnchor={setAnchor}
          min={min}
          max={max}
          offShabbosim={marked}
          today={today}
          stateOf={(day) => (day === value ? "both" : null)}
          onPick={(day) => {
            onChange(day);
            close();
          }}
        />
      ) : null}
    </div>
  );
}
