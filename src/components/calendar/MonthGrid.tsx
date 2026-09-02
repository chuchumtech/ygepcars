"use client";

import {
  dateRangeList,
  parseLocalDate,
  splitIntoDaySegments,
  viewBounds,
} from "@/lib/calendar";
import { todayLocal } from "@/lib/dates";
import { EventChip } from "./EventChip";
import type { CalEvent } from "./types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS_PER_DAY = 3;

export function MonthGrid({
  anchor,
  events,
  onSelectEvent,
  onSelectDay,
}: {
  anchor: string;
  events: CalEvent[];
  onSelectEvent: (event: CalEvent) => void;
  onSelectDay: (date: string) => void;
}) {
  const bounds = viewBounds("month", anchor);
  const days = dateRangeList(bounds.from, bounds.to);
  const anchorMonth = parseLocalDate(anchor).m;
  const today = todayLocal();

  // One bucket per visible day; a multi-day reservation lands in each day it
  // covers so it reads correctly no matter which cell the office looks at.
  const byDay = new Map<string, CalEvent[]>();
  for (const day of days) byDay.set(day, []);
  for (const event of events) {
    for (const segment of splitIntoDaySegments(
      event.startsAt,
      event.endsAt,
      bounds.from,
      bounds.to,
    )) {
      byDay.get(segment.date)?.push(event);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-[var(--color-line)] bg-navy-50">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted"
          >
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden">{day[0]}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayEvents = byDay.get(day) ?? [];
          const inMonth = parseLocalDate(day).m === anchorMonth;
          const isToday = day === today;
          const shown = dayEvents.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = dayEvents.length - shown.length;

          return (
            <div
              key={day}
              className={`min-h-24 border-r border-b border-[var(--color-line)] p-1 last:border-r-0 sm:min-h-28 ${
                inMonth ? "bg-white" : "bg-navy-50/40"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition hover:bg-navy-100 ${
                  isToday
                    ? "bg-navy-700 text-white hover:bg-navy-800"
                    : inMonth
                      ? "text-navy-800"
                      : "text-navy-300"
                }`}
                aria-label={`Open ${day}`}
              >
                {parseLocalDate(day).d}
              </button>

              <div className="space-y-0.5">
                {shown.map((event) => (
                  <EventChip
                    key={`${day}-${event.id}`}
                    event={event}
                    onSelect={onSelectEvent}
                  />
                ))}
                {overflow > 0 ? (
                  <button
                    type="button"
                    onClick={() => onSelectDay(day)}
                    className="w-full rounded px-1.5 py-0.5 text-left text-[11px] font-semibold text-navy-600 hover:bg-navy-50"
                  >
                    +{overflow} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
