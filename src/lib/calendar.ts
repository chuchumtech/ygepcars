import { instantToLocalParts, localToInstant } from "@/lib/dates";

export type CalendarView = "month" | "week" | "day" | "list";

export const CALENDAR_VIEWS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "list", label: "List" },
];

export function isCalendarView(value: string | undefined): value is CalendarView {
  return value === "month" || value === "week" || value === "day" || value === "list";
}

/* -------------------------------------------------------------------------- */
/* Local date-string arithmetic. Everything here is YYYY-MM-DD in the org      */
/* timezone; instants only appear at the edges when we query the database.     */
/* -------------------------------------------------------------------------- */

export function parseLocalDate(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

export function shiftDays(date: string, days: number): string {
  const { y, m, d } = parseLocalDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function shiftMonths(date: string, months: number): string {
  const { y, m, d } = parseLocalDate(date);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  // Clamp so 31 Jan + 1 month lands on 28/29 Feb rather than spilling into March.
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)),
  )
    .toISOString()
    .slice(0, 10);
}

/** 0 = Sunday. */
export function dayOfWeek(date: string): number {
  const { y, m, d } = parseLocalDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function startOfWeek(date: string): string {
  return shiftDays(date, -dayOfWeek(date));
}

export function startOfMonth(date: string): string {
  const { y, m } = parseLocalDate(date);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export function endOfMonth(date: string): string {
  const { y, m } = parseLocalDate(date);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  return Math.round(
    (Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000,
  );
}

export function dateRangeList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let cursor = from; cursor <= to; cursor = shiftDays(cursor, 1)) out.push(cursor);
  return out;
}

/* -------------------------------------------------------------------------- */
/* View windows                                                               */
/* -------------------------------------------------------------------------- */

/** The local dates a view covers, padded to whole weeks for the month grid. */
export function viewBounds(view: CalendarView, anchor: string): { from: string; to: string } {
  switch (view) {
    case "month": {
      const from = startOfWeek(startOfMonth(anchor));
      const gridEnd = shiftDays(startOfWeek(endOfMonth(anchor)), 6);
      return { from, to: gridEnd };
    }
    case "week": {
      const from = startOfWeek(anchor);
      return { from, to: shiftDays(from, 6) };
    }
    case "day":
      return { from: anchor, to: anchor };
    case "list":
      return { from: anchor, to: shiftDays(anchor, 89) };
  }
}

/** The same window as instants, for querying timestamptz columns. */
export function viewInstants(view: CalendarView, anchor: string): { from: Date; to: Date } {
  const bounds = viewBounds(view, anchor);
  return {
    from: localToInstant(bounds.from, "00:00"),
    to: localToInstant(shiftDays(bounds.to, 1), "00:00"),
  };
}

export function stepAnchor(view: CalendarView, anchor: string, direction: -1 | 1): string {
  switch (view) {
    case "month":
      return shiftMonths(anchor, direction);
    case "week":
      return shiftDays(anchor, 7 * direction);
    case "day":
      return shiftDays(anchor, direction);
    case "list":
      return shiftDays(anchor, 30 * direction);
  }
}

/* -------------------------------------------------------------------------- */
/* Laying events onto a day column                                            */
/* -------------------------------------------------------------------------- */

export type DaySegment = {
  /** Local date this piece of the event falls on. */
  date: string;
  /** Fraction of the day the block starts at, 0-1. */
  top: number;
  /** Fraction of the day the block covers, 0-1. */
  height: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * Splits an event into one piece per local day it touches, so a Thursday-night
 * to Sunday-afternoon reservation draws as three blocks in a week grid rather
 * than one impossible one.
 */
export function splitIntoDaySegments(
  startsAt: string | Date,
  endsAt: string | Date,
  clampFrom: string,
  clampTo: string,
): DaySegment[] {
  const start = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;

  const startParts = instantToLocalParts(start);
  const endParts = instantToLocalParts(end);

  // An event ending exactly at midnight belongs to the previous day, not to a
  // zero-height sliver at the top of the next one.
  const lastDate =
    endParts.time === "00:00" && endParts.date > startParts.date
      ? shiftDays(endParts.date, -1)
      : endParts.date;

  const first = startParts.date < clampFrom ? clampFrom : startParts.date;
  const last = lastDate > clampTo ? clampTo : lastDate;
  if (first > last) return [];

  const segments: DaySegment[] = [];

  for (const date of dateRangeList(first, last)) {
    const dayStart = localToInstant(date, "00:00").getTime();
    const dayEnd = localToInstant(shiftDays(date, 1), "00:00").getTime();
    const dayLength = dayEnd - dayStart;

    const pieceStart = Math.max(start.getTime(), dayStart);
    const pieceEnd = Math.min(end.getTime(), dayEnd);
    if (pieceEnd <= pieceStart) continue;

    segments.push({
      date,
      top: (pieceStart - dayStart) / dayLength,
      height: (pieceEnd - pieceStart) / dayLength,
      continuesBefore: start.getTime() < dayStart,
      continuesAfter: end.getTime() > dayEnd,
    });
  }

  return segments;
}

/** Stable, readable colours per car, assigned by position in the fleet list. */
export const CAR_COLORS = [
  { key: "indigo", bar: "bg-indigo-500", soft: "bg-indigo-50", border: "border-indigo-400", text: "text-indigo-900", dot: "bg-indigo-500" },
  { key: "teal", bar: "bg-teal-600", soft: "bg-teal-50", border: "border-teal-500", text: "text-teal-900", dot: "bg-teal-600" },
  { key: "amber", bar: "bg-amber-500", soft: "bg-amber-50", border: "border-amber-400", text: "text-amber-900", dot: "bg-amber-500" },
  { key: "rose", bar: "bg-rose-500", soft: "bg-rose-50", border: "border-rose-400", text: "text-rose-900", dot: "bg-rose-500" },
  { key: "violet", bar: "bg-violet-500", soft: "bg-violet-50", border: "border-violet-400", text: "text-violet-900", dot: "bg-violet-500" },
  { key: "sky", bar: "bg-sky-600", soft: "bg-sky-50", border: "border-sky-500", text: "text-sky-900", dot: "bg-sky-600" },
] as const;

export function carColor(index: number) {
  return CAR_COLORS[index % CAR_COLORS.length];
}
