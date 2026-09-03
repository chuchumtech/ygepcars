"use client";

import { formatDayLong, formatTime } from "@/lib/dates";
import { carColor, dateRangeList, splitIntoDaySegments, viewBounds } from "@/lib/calendar";
import { EmptyState } from "@/components/ui";
import type { CalEvent } from "./types";

/** Straight chronological read-out -- what the office prints for the day sheet. */
export function AgendaList({
  anchor,
  events,
  onSelectEvent,
}: {
  anchor: string;
  events: CalEvent[];
  onSelectEvent: (event: CalEvent) => void;
}) {
  const bounds = viewBounds("list", anchor);

  const byDay = new Map<string, CalEvent[]>();
  for (const event of events) {
    for (const segment of splitIntoDaySegments(
      event.startsAt,
      event.endsAt,
      bounds.from,
      bounds.to,
    )) {
      const bucket = byDay.get(segment.date) ?? [];
      bucket.push(event);
      byDay.set(segment.date, bucket);
    }
  }

  const days = dateRangeList(bounds.from, bounds.to).filter((day) => byDay.has(day));

  if (days.length === 0) {
    return (
      <EmptyState
        title="Nothing on the books"
        description="No reservations in the next three months from this date."
      />
    );
  }

  return (
    <div className="space-y-5">
      {days.map((day) => (
        <section key={day} className="card overflow-hidden">
          <h3 className="border-b border-line/70 bg-parchment px-4 py-2 text-sm font-semibold text-ink">
            {formatDayLong(`${day}T12:00:00Z`)}
          </h3>
          <ul className="divide-y divide-line/70">
            {(byDay.get(day) ?? []).map((event, index) => {
              const color = carColor(event.vehicleIndex);
              return (
                <li key={`${day}-${event.id}-${index}`}>
                  <button
                    type="button"
                    onClick={() => onSelectEvent(event)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-parchment"
                  >
                    <span
                      className={`h-8 w-1 shrink-0 rounded-full ${
                        event.kind === "blackout" ? "bg-navy-300" : color.bar
                      }`}
                      aria-hidden
                    />
                    <span className="w-32 shrink-0 text-xs tabular-nums text-ink-soft">
                      {formatTime(event.startsAt)} – {formatTime(event.endsAt)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {event.title}
                      </span>
                      {event.subtitle ? (
                        <span className="block truncate text-xs text-ink-soft">
                          {event.subtitle}
                        </span>
                      ) : null}
                    </span>
                    {event.status ? (
                      <span className="chip shrink-0 bg-parchment-deep text-ink capitalize">
                        {event.status}
                      </span>
                    ) : (
                      <span className="chip shrink-0 bg-parchment-deep text-ink-soft">
                        Out of service
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
