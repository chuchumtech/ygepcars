"use client";

import { Fragment } from "react";
import { splitIntoDaySegments } from "@/lib/calendar";
import { formatTime, todayLocal } from "@/lib/dates";
import { eventStyles } from "./EventChip";
import type { CalEvent } from "./types";

const HOUR_HEIGHT = 44; // px
const DAY_HEIGHT = HOUR_HEIGHT * 24;

function hourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export type TimeColumn = {
  key: string;
  /** The local date this column draws. */
  date: string;
  heading: string;
  subheading?: string;
  /** Restrict the column to one car, for the day view's per-car columns. */
  vehicleId?: string;
  highlight?: boolean;
};

/**
 * Shared hour-by-hour grid behind the week and day views. Columns are days in
 * the week view and cars in the day view, so both read the same way.
 */
export function TimeGrid({
  columns,
  events,
  onSelectEvent,
}: {
  columns: TimeColumn[];
  events: CalEvent[];
  onSelectEvent: (event: CalEvent) => void;
}) {
  const today = todayLocal();
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[42rem]">
          {/* Column headings */}
          <div
            className="sticky top-0 z-10 grid border-b border-line/70 bg-white/95 backdrop-blur"
            style={{ gridTemplateColumns: `4rem repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            <div />
            {columns.map((column) => (
              <div
                key={column.key}
                className={`border-l border-line/70 px-2 py-2 text-center ${
                  column.highlight ?? column.date === today ? "bg-parchment" : ""
                }`}
              >
                <p className="text-xs font-semibold text-ink">{column.heading}</p>
                {column.subheading ? (
                  <p className="text-[11px] text-ink-soft">{column.subheading}</p>
                ) : null}
              </div>
            ))}
          </div>

          {/* Hour rows + positioned blocks */}
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `4rem repeat(${columns.length}, minmax(0, 1fr))`,
              height: DAY_HEIGHT,
            }}
          >
            <div className="relative">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-ink-soft"
                  style={{ top: hour * HOUR_HEIGHT }}
                >
                  {hour === 0 ? "" : hourLabel(hour)}
                </div>
              ))}
            </div>

            {columns.map((column) => {
              const columnEvents = events.filter(
                (event) => !column.vehicleId || event.vehicleId === column.vehicleId,
              );

              // Lay overlapping blocks side by side so neither one hides the other.
              const placed: { event: CalEvent; top: number; height: number }[] = [];
              for (const event of columnEvents) {
                for (const segment of splitIntoDaySegments(
                  event.startsAt,
                  event.endsAt,
                  column.date,
                  column.date,
                )) {
                  placed.push({
                    event,
                    top: segment.top * DAY_HEIGHT,
                    height: Math.max(18, segment.height * DAY_HEIGHT),
                  });
                }
              }

              const lanes: number[] = [];
              const laneOf = placed.map((block) => {
                const index = lanes.findIndex((end) => end <= block.top + 0.5);
                const lane = index === -1 ? lanes.length : index;
                lanes[lane] = block.top + block.height;
                return lane;
              });
              const laneCount = Math.max(1, lanes.length);

              return (
                <div
                  key={column.key}
                  className={`relative border-l border-line/70 ${
                    column.highlight ?? column.date === today ? "bg-parchment/40" : ""
                  }`}
                >
                  {hours.map((hour) => (
                    <Fragment key={hour}>
                      <div
                        className="absolute inset-x-0 border-t border-line/70"
                        style={{ top: hour * HOUR_HEIGHT }}
                      />
                    </Fragment>
                  ))}

                  {placed.map((block, index) => {
                    const styles = eventStyles(block.event);
                    const lane = laneOf[index];
                    const width = 100 / laneCount;
                    const compact = block.height < 34;

                    return (
                      <button
                        key={`${block.event.id}-${index}`}
                        type="button"
                        onClick={() => onSelectEvent(block.event)}
                        title={`${block.event.title} · ${formatTime(block.event.startsAt)}`}
                        className={`absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight transition hover:z-20 hover:brightness-95 ${styles.className}`}
                        style={{
                          top: block.top + 1,
                          height: block.height - 2,
                          left: `calc(${lane * width}% + 2px)`,
                          width: `calc(${width}% - 4px)`,
                        }}
                      >
                        <span className="block truncate font-semibold">
                          {block.event.title}
                        </span>
                        {!compact ? (
                          <>
                            <span className="block truncate tabular-nums opacity-70">
                              {formatTime(block.event.startsAt)} –{" "}
                              {formatTime(block.event.endsAt)}
                            </span>
                            {block.height > 60 && block.event.subtitle ? (
                              <span className="block truncate opacity-70">
                                {block.event.subtitle}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
