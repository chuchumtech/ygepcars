"use client";

import { useEffect, useMemo, useState } from "react";
import {
  dateRangeList,
  daysBetween,
  eventDayRange,
  parseLocalDate,
  shiftDays,
  viewBounds,
} from "@/lib/calendar";
import { formatTimeShort, todayLocal } from "@/lib/dates";
import { useOffShabbosim } from "@/components/OffShabbosimProvider";
import type { HebrewMonth } from "@/lib/hebrew";
import { eventStyles } from "./EventChip";
import type { CalEvent } from "./types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** How many bars a week shows before the rest collapse into "+N more". */
const MAX_LANES = 3;
/** Pixels from the top of a week to the first bar, clearing the date header. */
const LANE_TOP = 52;
const LANE_HEIGHT = 22;

type Bar = {
  event: CalEvent;
  /** Column the bar starts and ends on within this week, 0-6. */
  from: number;
  to: number;
  /** Whether the reservation itself starts/ends here, or runs on past the edge. */
  isStart: boolean;
  isEnd: boolean;
  lane: number;
};

/**
 * Lay a week's events into lanes, so two reservations that overlap in time sit
 * on separate rows and one that does not can reuse the row above it.
 */
function assignLanes(bars: Omit<Bar, "lane">[]): Bar[] {
  const laneEnds: number[] = [];

  return bars
    .slice()
    .sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from))
    .map((bar) => {
      let lane = laneEnds.findIndex((end) => end < bar.from);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(bar.to);
      } else {
        laneEnds[lane] = bar.to;
      }
      return { ...bar, lane };
    });
}

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
  const anchorMonth = parseLocalDate(anchor).m;
  const today = todayLocal();
  const offShabbosim = useOffShabbosim();

  const [notes, setNotes] = useState<HebrewMonth>(new Map());

  // The Hebrew calendar tables are a couple of hundred kilobytes, so they load
  // after the grid rather than holding it up. Without them it still draws.
  useEffect(() => {
    let cancelled = false;
    const first = parseLocalDate(bounds.from);
    const last = parseLocalDate(bounds.to);

    import("@/lib/hebrew")
      .then(({ loadHebrewMonth }) =>
        loadHebrewMonth(
          new Date(first.y, first.m - 1, first.d),
          new Date(last.y, last.m - 1, last.d),
        ),
      )
      .then((loaded) => {
        if (!cancelled) setNotes(loaded);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [bounds.from, bounds.to]);

  // One row per week, each carrying its own bars: a reservation crossing a
  // week boundary is drawn as two bars that each look open-ended, which is the
  // only honest way to show it on a grid that wraps.
  const weeks = useMemo(() => {
    const out: { start: string; days: string[]; bars: Bar[] }[] = [];

    for (
      let weekStart = bounds.from;
      weekStart <= bounds.to;
      weekStart = shiftDays(weekStart, 7)
    ) {
      const weekEnd = shiftDays(weekStart, 6);
      const spans: Omit<Bar, "lane">[] = [];

      for (const event of events) {
        const { first, last } = eventDayRange(event.startsAt, event.endsAt);
        if (last < weekStart || first > weekEnd) continue;

        spans.push({
          event,
          from: Math.max(0, daysBetween(weekStart, first)),
          to: Math.min(6, daysBetween(weekStart, last)),
          isStart: first >= weekStart,
          isEnd: last <= weekEnd,
        });
      }

      out.push({
        start: weekStart,
        days: dateRangeList(weekStart, weekEnd),
        bars: assignLanes(spans),
      });
    }

    return out;
  }, [bounds.from, bounds.to, events]);

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line/70 bg-parchment">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-soft"
          >
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden">{day[0]}</span>
          </div>
        ))}
      </div>

      {weeks.map((week) => {
        const lanes = Math.min(
          MAX_LANES,
          week.bars.reduce((most, bar) => Math.max(most, bar.lane + 1), 0),
        );
        const hidden = week.bars.filter((bar) => bar.lane >= MAX_LANES);
        // The "+N more" line needs a row of its own, or it falls out of the week.
        const overflowRow = hidden.length > 0 ? LANE_HEIGHT : 0;

        // A day is only "+N more" if a hidden bar actually covers that day.
        const overflowByColumn = week.days.map(
          (_, column) =>
            hidden.filter((bar) => bar.from <= column && column <= bar.to).length,
        );

        return (
          <div
            key={week.start}
            className="relative grid grid-cols-7 border-b border-line/70 last:border-b-0"
            style={{
              minHeight: LANE_TOP + Math.max(lanes, 1) * LANE_HEIGHT + overflowRow + 8,
            }}
          >
            {week.days.map((day) => {
              const inMonth = parseLocalDate(day).m === anchorMonth;
              const isToday = day === today;
              const note = notes.get(day);
              const off = offShabbosim[day];
              const reading = note?.parsha ?? (note?.isYomTov ? note.holiday : undefined);

              return (
                <div
                  key={day}
                  className={`border-r border-line/70 px-1 pt-1 last:border-r-0 ${
                    off
                      ? "bg-brand-light/60"
                      : note?.isYomTov
                        ? "bg-gold-light/60"
                        : inMonth
                          ? "bg-white"
                          : "bg-parchment/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => onSelectDay(day)}
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition hover:bg-parchment-deep ${
                        isToday
                          ? "bg-slate-500 text-white hover:bg-slate-600"
                          : inMonth
                            ? "text-ink"
                            : "text-navy-300"
                      }`}
                      aria-label={`Open ${day}`}
                    >
                      {parseLocalDate(day).d}
                    </button>
                    {note ? (
                      <span className="truncate text-[10px] leading-none text-ink-soft">
                        {note.hebrewDay}
                      </span>
                    ) : null}
                  </div>

                  {reading ? (
                    <p
                      dir="rtl"
                      className={`truncate text-[9px] leading-tight ${
                        note?.isYomTov ? "font-bold text-gold" : "text-ink-soft"
                      }`}
                      title={note?.parshaEn ?? note?.holidayEn ?? reading}
                    >
                      {reading}
                    </p>
                  ) : null}

                  {off ? (
                    <p
                      className="mt-0.5 w-fit max-w-full truncate rounded-full bg-brand px-1.5 text-[9px] font-bold leading-tight text-white"
                      title={`${off.label} — the yeshiva is off this ${off.part === "shabbos" ? "Shabbos" : off.part === "friday" ? "Friday" : "Sunday"}`}
                    >
                      {off.label}
                    </p>
                  ) : null}
                </div>
              );
            })}

            {week.bars
              .filter((bar) => bar.lane < MAX_LANES)
              .map((bar) => {
                const styles = eventStyles(bar.event);
                const span = bar.to - bar.from + 1;

                return (
                  <button
                    key={`${week.start}-${bar.event.id}`}
                    type="button"
                    onClick={() => onSelectEvent(bar.event)}
                    title={`${bar.event.title} · ${bar.event.subtitle}`}
                    style={{
                      left: `calc(${(bar.from / 7) * 100}% + 3px)`,
                      width: `calc(${(span / 7) * 100}% - 6px)`,
                      top: LANE_TOP + bar.lane * LANE_HEIGHT,
                      height: LANE_HEIGHT - 4,
                    }}
                    className={`absolute flex items-center gap-1 overflow-hidden px-1.5 text-left text-[11px] font-medium transition hover:brightness-95 ${
                      styles.className
                    } ${bar.isStart ? "rounded-l" : ""} ${bar.isEnd ? "rounded-r" : ""}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`}
                      aria-hidden
                    />
                    <span className="shrink-0 tabular-nums font-semibold">
                      {bar.isStart ? formatTimeShort(bar.event.startsAt) : "←"}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{bar.event.title}</span>
                    <span className="shrink-0 tabular-nums opacity-75">
                      {bar.isEnd ? formatTimeShort(bar.event.endsAt) : "→"}
                    </span>
                  </button>
                );
              })}

            {overflowByColumn.map((count, column) =>
              count > 0 ? (
                <button
                  key={`${week.start}-more-${column}`}
                  type="button"
                  onClick={() => onSelectDay(week.days[column])}
                  style={{
                    left: `calc(${(column / 7) * 100}% + 3px)`,
                    width: `calc(${(1 / 7) * 100}% - 6px)`,
                    top: LANE_TOP + MAX_LANES * LANE_HEIGHT,
                  }}
                  className="absolute rounded px-1 text-left text-[11px] font-semibold text-ink hover:bg-parchment"
                >
                  +{count} more
                </button>
              ) : null,
            )}
          </div>
        );
      })}
    </div>
  );
}
